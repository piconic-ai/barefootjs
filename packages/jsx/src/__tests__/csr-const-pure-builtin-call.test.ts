/**
 * #3926: a component const computed by a method call whose arguments read a
 * prop (`['doc', 'api'].includes(props.kind)`) had no CSR-template form, so the
 * template read it as `undefined`. The post-substitution check took the call
 * for a helper that must not run at template scope (#1138). A catalogued
 * method on a literal receiver, and a read of an env signal's getter, are pure
 * by construction, whatever the adapter accepts.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

function templateOf(source: string): string {
  const result = compileJSX(source, 'Probe.tsx', { adapter: new TestAdapter() })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const clientJs = result.files.find(f => f.type === 'clientJs')!
  const line = clientJs.content.split('\n').find(l => l.includes('hydrate('))
  if (!line) throw new Error('no hydrate() call in client JS')
  return line
}

describe('a pure builtin call in a const initializer reaches the CSR template (#3926)', () => {
  test('a method on an array literal with a prop argument', () => {
    const template = templateOf(`
      export function Probe(props: { kind: string }) {
        const root = ['doc', 'api'].includes(props.kind) ? 'known' : 'other'
        return <a href={root}>{root}</a>
      }
    `)
    expect(template).toContain(`['doc', 'api'].includes(_p.kind)`)
    expect(template).not.toContain('undefined')
  })

  test('a string literal receiver, and a receiver held in a local const', () => {
    const template = templateOf(`
      export function Probe(props: { word: string }) {
        const words = ['a', 'b']
        const hit = 'alpha'.includes(props.word) ? 'in' : 'out'
        const listed = words.includes(props.word) ? 'yes' : 'no'
        return <p title={hit}>{listed}</p>
      }
    `)
    expect(template).toContain(`'alpha'.includes(_p.word)`)
    expect(template).toContain(`['a', 'b']).includes(_p.word)`)
    expect(template).not.toContain('undefined')
  })

  test('a const read through another const', () => {
    const template = templateOf(`
      export function Probe(props: { kind: string }) {
        const known = ['doc', 'api'].includes(props.kind)
        const label = known ? 'known' : 'other'
        return <p>{label}</p>
      }
    `)
    expect(template).toContain(`.includes(_p.kind)`)
    expect(template).not.toContain('undefined')
  })

  test('a chained catalogued method keeps its receiver pure', () => {
    const template = templateOf(`
      export function Probe(props: { kind: string; extra: string }) {
        const ok = ['doc'].concat(props.extra).includes(props.kind) ? 'y' : 'n'
        return <p>{ok}</p>
      }
    `)
    expect(template).toContain(`.concat(_p.extra).includes(_p.kind)`)
  })

  test('a call whose argument is a helper call stays out of the template', () => {
    const template = templateOf(`
      let n = 0
      function bump(s: string) { n++; return s }
      export function Probe(props: { kind: string }) {
        const r = ['a', 'b'].includes(bump(props.kind)) ? 'y' : 'n'
        return <p>{r}</p>
      }
    `)
    expect(template).not.toContain('bump(')
  })

  test('a method that is not catalogued, on a literal, stays out of the template', () => {
    const template = templateOf(`
      export function Probe(props: { kind: string }) {
        const r = ['a'].push(props.kind)
        return <p>{r}</p>
      }
    `)
    expect(template).not.toContain('.push(')
  })

  test('an env signal getter and its read-only methods', () => {
    const template = templateOf(`
      import { createSearchParams } from '@barefootjs/client'
      export function Probe(props: { param: string }) {
        const [sp] = createSearchParams()
        const sort = sp().get('sort') ?? 'none'
        const named = sp().get(props.param) ?? 'unset'
        return <a href={sort} title={named}>{sort}</a>
      }
    `)
    expect(template).toContain(`const [sp] = createSearchParams()`)
    expect(template).toContain(`sp().get('sort') ?? 'none'`)
    expect(template).toContain(`sp().get(_p.param) ?? 'unset'`)
    expect(template).not.toContain('undefined')
  })

  test('a mutating method on an env signal result stays out of the template', () => {
    const template = templateOf(`
      import { createSearchParams } from '@barefootjs/client'
      export function Probe(props: { param: string }) {
        const [sp] = createSearchParams()
        const r = sp().append(props.param, 'x')
        return <p>{String(r)}</p>
      }
    `)
    expect(template).not.toContain('.append(')
  })
})
