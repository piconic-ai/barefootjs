/**
 * A props destructure default that reads an earlier binding of its own
 * pattern (`{ off = false, on = off }`, #3531). The analyzer splits the
 * default at those reads (`ParamInfo.defaultParts`), and the client JS
 * renders each as the earlier prop's own live read, so no emitted scope
 * names a binding it lacks.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { splitScopedValueRefs } from '../prop-rewrite'

const adapter = new TestAdapter()

function clientJs(source: string): string {
  const result = compileJSX(source, 'Component.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const file = result.files.find(f => f.type === 'clientJs')
  expect(file).toBeDefined()
  return file!.content
}

function propsParams(source: string) {
  return analyzeComponent(source, 'Component.tsx').propsParams
}

describe('ParamInfo.defaultParts', () => {
  test('records each read of an earlier binding, carrying its own read for a chain', () => {
    const params = propsParams(`
      function C({ a = 'x', b = a, c = b }: { a?: string; b?: string; c?: string }) {
        return <p>{c}</p>
      }
    `)
    const byName = new Map(params.map(p => [p.name, p]))
    expect(byName.get('a')!.defaultParts).toBeUndefined()
    expect(byName.get('b')!.defaultParts).toEqual([
      { kind: 'param', param: { name: 'a', defaultValue: "'x'" } },
    ])
    const cParts = byName.get('c')!.defaultParts!
    expect(cParts).toHaveLength(1)
    expect(cParts[0]).toEqual({ kind: 'param', param: { name: 'b', defaultValue: 'a', defaultParts: byName.get('b')!.defaultParts } })
  })

  test('leaves a later binding (TDZ), an outer name and a shadowing callback param alone', () => {
    const params = propsParams(`
      const off = true
      function C({ first = later, x = 1, y = [1].map((x) => x + 1), later = 2 }: { first?: number; x?: number; y?: number[]; later?: number }) {
        return <p>{first}{y}</p>
      }
    `)
    for (const p of params) expect(p.defaultParts).toBeUndefined()
  })

  test('keeps a shorthand property key as text', () => {
    expect(splitScopedValueRefs('{ off, n: off }', new Set(['off']))).toEqual([
      { kind: 'text', text: '{ off: ' },
      { kind: 'ref', name: 'off' },
      { kind: 'text', text: ', n: ' },
      { kind: 'ref', name: 'off' },
      { kind: 'text', text: ' }' },
    ])
  })
})

describe('client JS reads the earlier prop live', () => {
  test('parameter form: the default reads the earlier prop with its own default', () => {
    const js = clientJs(`
      'use client'
      export function C({ off = false, on = off }: { off?: boolean; on?: boolean }) {
        return <p>{String(on && true)}</p>
      }
    `)
    expect(js).toContain('(_p.on ?? (_p.off ?? false))')
    expect(js).not.toContain('_p.on ?? off)')
  })

  test('a chain nests each earlier read, and an expression default keeps its operator', () => {
    const js = clientJs(`
      'use client'
      export function C({ a = 'x', b = a, c = b, off = false, on = !off }: { a?: string; b?: string; c?: string; off?: boolean; on?: boolean }) {
        return <p>{c}{String(on)}</p>
      }
    `)
    expect(js).toContain(`(_p.c ?? (_p.b ?? (_p.a ?? 'x')))`)
    expect(js).toContain('(_p.on ?? !(_p.off ?? false))')
  })

  test('a renamed earlier binding reads its caller-facing key', () => {
    const js = clientJs(`
      'use client'
      export function C({ off: o = false, on = o }: { off?: boolean; on?: boolean }) {
        return <p>{String(on)}</p>
      }
    `)
    expect(js).toContain('(_p.on ?? (_p.off ?? false))')
  })

  test('body form: the init body reads the earlier prop live too', () => {
    const js = clientJs(`
      'use client'
      export function C(props: { off?: boolean; on?: boolean }) {
        const { off = false, on = off } = props
        return <p>{String(on)}</p>
      }
    `)
    expect(js).not.toMatch(/_p\.on \?\? off\b/)
    expect(js).toContain('(_p.on ?? (_p.off ?? false))')
  })

  test('the CSR template reads a signal seed and a memo over the prop with its default', () => {
    const js = clientJs(`
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      export function C({ off = false, on = off }: { off?: boolean; on?: boolean }) {
        const [v, setV] = createSignal(on)
        const flipped = createMemo(() => !on)
        return <p onClick={() => setV(!v())}>{String(v())}|{String(flipped())}</p>
      }
    `)
    const template = js.slice(js.indexOf('template: (_p) =>'))
    expect(template).toContain('String(((_p.on ?? (_p.off ?? false))))')
    expect(template).toContain('String((!(_p.on ?? (_p.off ?? false))))')
  })

  test('a controlled signal seeded by the prop reads the earlier prop live', () => {
    const js = clientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function C({ off = false, on = off }: { off?: boolean; on?: boolean }) {
        const [v, setV] = createSignal(on)
        return <button onClick={() => setV(!v())}>{String(v())}</button>
      }
    `)
    expect(js).not.toMatch(/_p\.on \?\? off\b/)
  })
})
