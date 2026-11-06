/**
 * A destructure default applies to an absent or `undefined` prop only; an
 * explicit `null` keeps `null` (`spec/js-undefined-value.md`, "Decisions"
 * (6)). Every client-JS read of a defaulted prop is
 * `_p.x === undefined ? d : _p.x`: the live reads in effects, the CSR
 * template, a signal seed, a controlled signal's seed, a written prop's
 * local, the `children` extraction and a body destructure of the props
 * object. A compiler-supplied guard of a defaultless prop (`?? []` for a
 * loop array) keeps replacing either nil.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

function clientJs(source: string): string {
  const result = compileJSX(source, 'Demo.tsx', { adapter: new TestAdapter() })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  return result.files.find(f => f.type === 'clientJs')!.content
}

describe('a destructure default in client JS applies to undefined only', () => {
  test('text, attribute, CSR template and signal seeds', () => {
    const js = clientJs(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Demo({ label = 'D', start = 0 }: { label?: string | null; start?: number | null }) {
  const [copy] = createSignal(label)
  return <p title={label} data-s={start}>{label}{copy()}</p>
}
`)
    expect(js).toContain("(_p.label === undefined ? 'D' : _p.label)")
    expect(js).toContain("createSignal(_p.label === undefined ? 'D' : _p.label)")
    expect(js).toContain('(_p.start === undefined ? 0 : _p.start)')
    expect(js).not.toContain('_p.label ??')
    expect(js).not.toContain('_p.start ??')
  })

  test('a body destructure of the props object and a written prop', () => {
    const js = clientJs(`
'use client'
export function Demo(props: { label?: string | null; n?: number | null }) {
  const { label = 'D' } = props
  return <p>{label}</p>
}
export function Counter({ n = 1 }: { n?: number | null }) {
  n = n + 1
  return <p>{n}</p>
}
`)
    expect(js).toContain("(_p.label === undefined ? 'D' : _p.label)")
    expect(js).toContain('let n = _p.n === undefined ? 1 : _p.n')
    expect(js).not.toContain('_p.label ??')
    expect(js).not.toContain('_p.n ??')
  })

  test('a default reading an earlier binding kept as a local reads that local', () => {
    const js = clientJs(`
'use client'
export function Demo(props: { a?: string[]; b?: string[] }) {
  let { a = [], b = a } = props
  a.push('x')
  return <p>{b.length}</p>
}
export function Assigned(props: { a?: number; b?: number; c?: number }) {
  let { a = 1, b = (a = 2), c = a } = props
  return <p>{c}</p>
}
export function Kept(props: { a?: string[]; b?: string[] }) {
  const { a = [], b = a } = props
  a.push('x')
  return <p>{b.length}</p>
}
`)
    expect(js).toContain('let b = _p.b === undefined ? a : _p.b')
    // An unread binding whose default assigns stays, so the assignment runs.
    expect(js).toContain('let b = _p.b === undefined ? (a = 2) : _p.b')
    expect(js).toContain('let c = _p.c === undefined ? a : _p.c')
    expect(js).toContain('const b = _p.b === undefined ? a : _p.b')
    expect(js).not.toContain('let b = _p.b === undefined ? (_p.a')
    expect(js).not.toContain('const b = _p.b === undefined ? (_p.a')
  })

  test('an arrow default keeps its own parens', () => {
    const js = clientJs(`
'use client'
export function Demo({ fmt = (v: string) => v + '!' }: { fmt?: (v: string) => string }) {
  return <p>{fmt('x')}</p>
}
`)
    expect(js).toContain("(_p.fmt === undefined ? ((v) => v + '!') : _p.fmt)('x')")
  })

  test("an author's `??` over a prop keeps replacing null", () => {
    const js = clientJs(`
'use client'
export function Demo(props: { label?: string | null }) {
  const label = props.label ?? 'x'
  return <p>{label.toUpperCase()}</p>
}
`)
    expect(js).toContain("(_p.label ?? 'x')")
    expect(js).not.toContain('_p.label === undefined')
  })

  test('a defaultless loop array keeps its nil guard', () => {
    const js = clientJs(`
'use client'
export function Demo({ items }: { items?: string[] | null }) {
  return <ul>{items.map(i => <li key={i}>{i}</li>)}</ul>
}
`)
    expect(js).toContain('(_p.items ?? [])')
  })
})
