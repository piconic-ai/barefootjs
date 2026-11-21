/**
 * The decision matrix for a key written both by a spread and by another
 * write on the same element (#3963): which write the IR keeps, per adapter
 * capability (`TemplateAdapter.spreadKeyRenames`), per renamed key, and per
 * position. JSX keeps the last write the server renders, once. The rendered
 * output is pinned by the `spread-open-bag-*` / `spread-closed-rest-*`
 * conformance fixtures; this pins the Phase 1 decision in one table.
 */

import { describe, test, expect } from 'bun:test'
import { SPREAD_KEY_ATTR_NAMES } from '@barefootjs/shared'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { ComponentIR, IRAttribute, IRElement, IRNode } from '../types'

class RenamesAllAdapter extends TestAdapter {
  spreadKeyRenames: ReadonlySet<string> = new Set(Object.keys(SPREAD_KEY_ATTR_NAMES))
}

function elementOf(source: string, adapter: TestAdapter): IRElement {
  const file = compileJSX(source, 'Component.tsx', { adapter, outputIR: true }).files.find(f => f.type === 'ir')
  if (!file) throw new Error('no IR')
  const ir = JSON.parse(file.content) as ComponentIR
  let found: IRElement | null = null
  const visit = (n: unknown): void => {
    if (found !== null || n === null || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(visit)
    if ((n as { type?: string }).type === 'element' && (n as IRElement).tag === 'x-el') found = n as IRElement
    else for (const v of Object.values(n)) visit(v)
  }
  visit(ir.root as IRNode)
  if (found === null) throw new Error('no <x-el>')
  return found
}

const attrNamed = (el: IRElement, name: string): IRAttribute[] => el.attrs.filter(a => a.name === name)
const textOf = (a: IRAttribute): string => (a.value.kind === 'literal' ? `literal:${a.value.value}` : a.value.kind === 'expression' ? a.value.expr : a.value.kind)

const everywhere = new Set(['className', 'htmlFor', 'httpEquiv'])
const keys = Object.entries(SPREAD_KEY_ATTR_NAMES)

describe('literal before an open bag: the guard reads the bag keys the adapter renames to the attribute', () => {
  for (const [key, attr] of keys) {
    for (const [label, adapter, renames] of [
      ['default', new TestAdapter(), everywhere],
      ['renames all', new RenamesAllAdapter(), new Set(keys.map(([k]) => k))],
    ] as const) {
      test(`${key} (${label})`, () => {
        const el = elementOf(`type P = { [key: string]: unknown }
export function C({ ...rest }: P) { return <x-el ${key}="lit" {...rest}>x</x-el> }`, adapter)
        const [lit] = attrNamed(el, attr)
        const reads = attr === 'class' ? [] : [`rest${/^[A-Za-z_$][\w$]*$/.test(attr) ? `.${attr}` : `[${JSON.stringify(attr)}]`} == null`]
        if (renames.has(key)) reads.push(`rest.${key} == null`)
        expect(lit.spreadOverridable?.expr).toBe(`${reads.join(' && ')} ? "lit" : undefined`)
      })
    }
  }
})

describe('closed rest then a write of the same key', () => {
  const type = `type P = { ${keys.map(([k]) => `${k}?: string`).join('; ')}; title?: string }`
  for (const [key, attr] of keys) {
    test(`${key}: a later literal replaces the rest key`, () => {
      const el = elementOf(`${type}
export function C({ ...rest }: P) { return <x-el {...rest} ${key}="lit">x</x-el> }`, new TestAdapter())
      expect(el.attrs.filter(a => a.name === key || a.name === attr).map(textOf)).toEqual(['literal:lit'])
    })
    test(`${key}: a later client-only write leaves the rest key on the server`, () => {
      const el = elementOf(`${type}
export function C({ ...rest }: P) { return <x-el {...rest} ${key}={/* @client */ 'c'}>x</x-el> }`, new TestAdapter())
      expect(el.attrs.filter(a => a.name === key).map(textOf)).toEqual([`rest.${key}`])
    })
  }
})

describe('literal, closed rest, (open bag,) closed rest', () => {
  const type = `type P = { title?: string; bag: Record<string, string> }`
  test('with no open bag between, the last rest carries the chain', () => {
    const el = elementOf(`${type}
export function C({ bag, ...rest }: P) { return <x-el title="f" {...rest} {...rest}>x</x-el> }`, new TestAdapter())
    expect(attrNamed(el, 'title').map(textOf)).toEqual(['rest.title ?? (rest.title ?? ("f"))'])
  })
  test('across an open bag, the chain is guarded by the bag lacking the key', () => {
    const el = elementOf(`${type}
export function C({ bag, ...rest }: P) { return <x-el title="f" {...rest} {...bag} {...rest}>x</x-el> }`, new TestAdapter())
    expect(attrNamed(el, 'title').map(textOf)).toEqual(['rest.title ?? (bag?.title == null ? (rest.title ?? ("f")) : undefined)'])
  })
  test('a literal before an open bag alone is not carried (it is guarded instead)', () => {
    const el = elementOf(`${type}
export function C({ bag, ...rest }: P) { return <x-el title="f" {...bag} {...rest}>x</x-el> }`, new TestAdapter())
    expect(attrNamed(el, 'title').map(textOf)).toEqual(['literal:f', 'rest.title'])
  })
})

describe('literal, closed rest, open bag, closed rest: per key and adapter', () => {
  const type = `type P = { ${keys.map(([k]) => `${k}?: string`).join('; ')}; bag?: Record<string, string> }`
  const renamesAll = new Set(keys.map(([k]) => k))
  for (const [key, attr] of keys) {
    for (const [label, adapter, renames] of [
      ['default', new TestAdapter(), everywhere],
      ['renames all', new RenamesAllAdapter(), renamesAll],
    ] as const) {
      test(`${key} (${label}): one write, ahead of the bag, guarded by the bag keys that render as ${attr}`, () => {
        const el = elementOf(`${type}
export function C({ bag, ...rest }: P) { return <x-el ${key}="lit" {...rest} {...bag} {...rest}>x</x-el> }`, adapter)
        const writes = el.attrs.map((a, i) => ({ a, i })).filter(({ a }) => a.name === key || a.name === attr)
        expect(writes.length).toBe(1)
        const bagIndex = el.attrs.findIndex(a => a.name === '...')
        expect(writes[0].i).toBeLessThan(bagIndex)
        const bagKeys = [...(attr === 'class' ? [] : [attr]), ...(renames.has(key) ? [key] : [])]
        const read = (k: string): string => (/^[A-Za-z_$][\w$]*$/.test(k) ? `bag?.${k}` : `bag?.[${JSON.stringify(k)}]`)
        const lacks = bagKeys.map(k => `${read(k)} == null`).join(' && ')
        expect(textOf(writes[0].a)).toBe(`rest.${key} ?? (${lacks} ? (rest.${key} ?? ("lit")) : undefined)`)
      })
    }
  }
})

describe('the bag read is nullish-safe only where the bag may be nullish', () => {
  test('an optional prop bag and a signal bag read with `?.`; the rest bag with `.`', () => {
    const el = elementOf(`import { createSignal } from '@barefootjs/client'
type P = { bag?: Record<string, string>; [key: string]: unknown }
export function C({ bag, ...rest }: P) {
  const [sig] = createSignal<Record<string, string> | undefined>(undefined)
  return <x-el title="t" {...bag} {...sig()} {...rest}>x</x-el>
}`, new TestAdapter())
    expect(attrNamed(el, 'title')[0].spreadOverridable?.expr).toBe('bag?.title == null && sig()?.title == null && rest.title == null ? "t" : undefined')
  })
})
