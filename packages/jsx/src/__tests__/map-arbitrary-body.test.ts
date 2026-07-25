/**
 * Stage 3 of spec/callback-fidelity.md — a `.map()` callback whose body
 * *constructs* JSX in a statement before its `return` (an imperative
 * array-builder: `const out = []; for (…) out.push(<td/>); return <tr>{out}</tr>`)
 * cannot be lowered to a template. Before this stage the compiler silently
 * spliced such statements into the loop preamble verbatim — and because the
 * type-stripper leaves JSX untouched, the raw `<td/>` leaked into the emitted
 * client bundle as invalid JS, with NO diagnostic. This pins the loud refusal
 * (BF021) that replaces the silent leak, on both a JS-runtime and a DSL adapter,
 * and guards that legitimate value-only preambles are NOT caught.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

function compile(source: string, dsl: boolean) {
  const a = new TestAdapter()
  // A DSL adapter's template runtime can't run a callback body verbatim.
  if (dsl) a.acceptsCallbackBody = () => false
  return compileJSX(source, 'List.tsx', { adapter: a })
}

const arrayBuilder = `
function Table({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</table>
}
export { Table }
`

describe('.map() arbitrary body — no silent JSX leak (Stage 3)', () => {
  for (const dsl of [false, true]) {
    const tier = dsl ? 'DSL' : 'JS-runtime'

    test(`an array-builder body refuses with BF021 (${tier})`, () => {
      const r = compile(arrayBuilder, dsl)
      const bf021 = r.errors.filter(e => e.code === 'BF021')
      expect(bf021).toHaveLength(1)
    })

    test(`the raw JSX never leaks into the client bundle (${tier})`, () => {
      const r = compile(arrayBuilder, dsl)
      const cj = r.files.find(f => f.type === 'clientJs')
      // The `out.push(<td>…</td>)` statement must not survive verbatim — raw
      // JSX in the plain-JS client bundle is a syntax error.
      expect(cj?.content ?? '').not.toMatch(/out\.push\(</)
      expect(cj?.content ?? '').not.toMatch(/<td>/)
    })
  }

  test('a value-only const preamble still compiles clean (no false positive)', () => {
    const src = `
function List({ items }: { items: { id: string; name: string }[] }) {
  return <ul>{items.map((it) => {
    const label = it.name.toUpperCase()
    return <li key={it.id}>{label}</li>
  })}</ul>
}
export { List }
`
    const r = compile(src, false)
    expect(r.errors.filter(e => e.code === 'BF021')).toHaveLength(0)
    const cj = r.files.find(f => f.type === 'clientJs')!
    expect(cj.content).toMatch(/const label\b/)
  })

  test('a plain single-return JSX body is unaffected', () => {
    const src = `
function List({ items }: { items: { id: string }[] }) {
  return <ul>{items.map((it) => { return <li key={it.id}>{it.id}</li> })}</ul>
}
export { List }
`
    const r = compile(src, true)
    expect(r.errors.filter(e => e.code === 'BF021')).toHaveLength(0)
  })
})
