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
  test('with no open bag between, every expansion stays, as on main (limitation closed-rest-repeated)', () => {
    const el = elementOf(`${type}
export function C({ bag, ...rest }: P) { return <x-el title="f" {...rest} {...rest}>x</x-el> }`, new TestAdapter())
    expect(attrNamed(el, 'title').map(textOf)).toEqual(['rest.title ?? ("f")', 'rest.title ?? (rest.title ?? ("f"))'])
    expect(attrNamed(el, 'title').map(a => a.spreadOverridable)).toEqual([undefined, undefined])
  })
  test('a closed rest, an open bag and two adjacent repeats: every expansion stays; only the first is guarded by the bag', () => {
    const el = elementOf(`${type}
export function C({ bag, ...rest }: P) { return <x-el title="f" {...rest} {...bag} {...rest} {...rest}>x</x-el> }`, new TestAdapter())
    const titles = attrNamed(el, 'title')
    expect(titles.map(textOf)).toEqual(['rest.title ?? ("f")', 'rest.title', 'rest.title ?? (rest.title)'])
    expect(titles[0].spreadOverridable?.expr).toBe('bag?.title == null ? (rest.title ?? ("f")) : undefined')
    expect(titles.slice(1).map(a => a.spreadOverridable)).toEqual([undefined, undefined])
  })
  test('across an open bag both expansions stay (limitation closed-rest-repeated); the first is guarded by the bag', () => {
    const el = elementOf(`${type}
export function C({ bag, ...rest }: P) { return <x-el title="f" {...rest} {...bag} {...rest}>x</x-el> }`, new TestAdapter())
    const titles = attrNamed(el, 'title')
    expect(titles.map(textOf)).toEqual(['rest.title ?? ("f")', 'rest.title'])
    expect(titles[0].spreadOverridable?.expr).toBe('bag?.title == null ? (rest.title ?? ("f")) : undefined')
    expect(titles[1].spreadOverridable).toBeUndefined()
  })
  test('a literal before an open bag alone is guarded, not folded', () => {
    const el = elementOf(`${type}
export function C({ bag, ...rest }: P) { return <x-el title="f" {...bag} {...rest}>x</x-el> }`, new TestAdapter())
    expect(attrNamed(el, 'title').map(textOf)).toEqual(['literal:f', 'rest.title'])
  })
})

describe('literal folded into a closed rest, then an open bag: per key and adapter', () => {
  const type = `type P = { ${keys.map(([k]) => `${k}?: string`).join('; ')}; bag?: Record<string, string> }`
  const renamesAll = new Set(keys.map(([k]) => k))
  for (const [key, attr] of keys) {
    for (const [label, adapter, renames] of [
      ['default', new TestAdapter(), everywhere],
      ['renames all', new RenamesAllAdapter(), renamesAll],
    ] as const) {
      test(`${key} (${label}): the rest's value and its fallback yield to the bag keys that render as ${attr}`, () => {
        const el = elementOf(`${type}
export function C({ bag, ...rest }: P) { return <x-el ${key}="lit" {...rest} {...bag}>x</x-el> }`, adapter)
        const [write] = el.attrs.filter(a => a.name === key)
        expect(textOf(write)).toBe(`rest.${key} ?? ("lit")`)
        const bagKeys = [...(attr === 'class' ? [] : [attr]), ...(renames.has(key) ? [key] : [])]
        const read = (k: string): string => (/^[A-Za-z_$][\w$]*$/.test(k) ? `bag?.${k}` : `bag?.[${JSON.stringify(k)}]`)
        const lacks = bagKeys.map(k => `${read(k)} == null`).join(' && ')
        expect(write.spreadOverridable?.expr).toBe(`${lacks} ? (rest.${key} ?? ("lit")) : undefined`)
      })
    }
  }
})

describe('component calls keep their exact prop keys', () => {
  test('a literal htmlFor and two closed rests around a bag carrying for: no alias reading, as before', () => {
    const file = compileJSX(`type P = { htmlFor?: string; bag: Record<string, string> }
function Child(_: { htmlFor?: string; for?: string }) { return <span /> }
export function C({ bag, ...rest }: P) { return <Child htmlFor="fallback" {...rest} {...bag} {...rest} /> }`, 'Component.tsx', { adapter: new TestAdapter(), outputIR: true }).files.filter(f => f.type === 'ir')
    const text = file.map(f => f.content).join('\n')
    expect(text).not.toContain('bag.for')
    expect(text).not.toContain('bag?.for')
    expect(text).toContain('rest.htmlFor ?? (\\"fallback\\")')
  })
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

describe('a closed rest key and an attribute that differ in letter case', () => {
  const texts = (el: IRElement): string[] => el.attrs.map(a => `${a.name}=${textOf(a)}`)
  test('a lowercase literal before the key becomes its fallback', () => {
    const el = elementOf(`export function C({ ...rest }: { tabIndex?: number }) { return <x-el tabindex="1" {...rest}>x</x-el> }`, new TestAdapter())
    expect(texts(el)).toEqual(['tabIndex=rest.tabIndex ?? ("1")'])
  })
  test('a lowercase literal after the key replaces it', () => {
    const el = elementOf(`export function C({ ...rest }: { tabIndex?: number }) { return <x-el {...rest} tabindex="1">x</x-el> }`, new TestAdapter())
    expect(texts(el)).toEqual(['tabindex=literal:1'])
  })
  test('two keys of one rest that differ in case stay separate writes', () => {
    const el = elementOf(`export function C({ ...rest }: { tabIndex?: number; tabindex?: number }) { return <x-el {...rest}>x</x-el> }`, new TestAdapter())
    expect(texts(el)).toEqual(['tabIndex=rest.tabIndex', 'tabindex=rest.tabindex'])
  })
  test('an SVG key the reference kebab-cases matches by its exact name only, on either side', () => {
    const type = '{ strokeWidth?: number; strokewidth?: number }'
    const after = elementOf(`export function C({ ...rest }: ${type}) { return <x-el {...rest} strokeWidth={3}>x</x-el> }`, new TestAdapter())
    expect(texts(after)).toEqual(['strokewidth=rest.strokewidth', 'stroke-width=3'])
    const before = elementOf(`export function C({ ...rest }: ${type}) { return <x-el strokeWidth={3} {...rest}>x</x-el> }`, new TestAdapter())
    expect(texts(before)).toEqual(['strokeWidth=rest.strokeWidth ?? (3)', 'strokewidth=rest.strokewidth'])
  })
  test('a boolean attribute is not folded', () => {
    const el = elementOf(`export function C({ ...rest }: { HIDDEN?: string }) { return <x-el hidden {...rest}>x</x-el> }`, new TestAdapter())
    expect(texts(el)).toEqual(['hidden=boolean-attr', 'HIDDEN=rest.HIDDEN'])
  })
  test('a non-ASCII letter is not folded: Ä and ä are two attributes', () => {
    const el = elementOf(`export function C({ ...rest }: { Ä?: number }) { return <x-el {...rest} ä="1">x</x-el> }`, new TestAdapter())
    expect(texts(el)).toEqual(['Ä=rest.Ä', 'ä=literal:1'])
  })
})

describe('a closed rest key named like an Object.prototype member', () => {
  // An alias table read with such a key must not return the inherited
  // member: the key is a plain attribute on an element and a plain prop on
  // a component.
  for (const key of ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf']) {
    test(`${key} on an element is a plain attribute`, () => {
      const el = elementOf(`export function C({ ...rest }: { ${key}?: string }) { return <x-el {...rest}>x</x-el> }`, new TestAdapter())
      expect(el.attrs.map(a => `${a.name}=${textOf(a)}`)).toEqual([`${key}=rest.${key}`])
    })
    test(`${key} beside a literal and an open bag compiles`, () => {
      const el = elementOf(`export function C({ bag, ...rest }: { ${key}?: string; bag?: Record<string, string> }) { return <x-el ${key}="lit" {...rest} {...bag}>x</x-el> }`, new TestAdapter())
      expect(el.attrs.filter(a => a.name === key).map(textOf)).toEqual([`rest.${key} ?? ("lit")`])
    })
    test(`${key} forwarded to a component is a plain prop`, () => {
      const result = compileJSX(`import { K } from './k'
export function C({ ...rest }: { ${key}?: string }) { return <K {...rest} /> }`, 'Component.tsx', { adapter: new TestAdapter(), outputIR: true })
      expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
      const ir = JSON.parse(result.files.find(f => f.type === 'ir')?.content ?? '{}') as ComponentIR
      const props: string[] = []
      const visit = (n: unknown): void => {
        if (n === null || typeof n !== 'object') return
        if (Array.isArray(n)) { n.forEach(visit); return }
        const node = n as { type?: string; props?: Array<{ name: string }> }
        if (node.type === 'component' && node.props) props.push(...node.props.map(p => p.name))
        for (const v of Object.values(n)) visit(v)
      }
      visit(ir.root)
      expect(props).toEqual([key])
    })
  }
})
