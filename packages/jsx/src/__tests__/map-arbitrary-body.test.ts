/**
 * Stage 3 (D4 + D5) of spec/callback-fidelity.md — a `.map()` callback whose
 * body *constructs* JSX in a statement before its `return` (an imperative
 * array-builder: `const out = []; for (…) out.push(<td/>); return <tr>{out}</tr>`).
 *
 * On a **JS-runtime** adapter (`acceptsCallbackBody() => true`) the body is now
 * rendered verbatim: each JSX leaf lowers to a template-literal HTML string, the
 * imperative control flow runs as-is, and the `{out}` element-array child is
 * joined into the row's innerHTML. No raw JSX leaks into the plain-JS bundle.
 *
 * On a **DSL** adapter (whose template runtime can't run a callback body) it
 * still refuses with BF021, always naming the `/* @client *\/` escape.
 *
 * D5 (keyFn = hoist): the loop key is evaluated before the body runs, so it must
 * be derivable from the raw item — a key that reads a preamble-computed local is
 * refused (it would compile to an unbound keyFn).
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
  return <table><tbody>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { Table }
`

describe('.map() array-builder body — JS-runtime verbatim (Stage 3 / D4)', () => {
  test('compiles with no BF021 on a JS-runtime adapter', () => {
    const r = compile(arrayBuilder, false)
    expect(r.errors.filter(e => e.code === 'BF021')).toHaveLength(0)
  })

  test('no raw JSX leaks into the client bundle; the leaf is a lowered string', () => {
    const r = compile(arrayBuilder, false)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    // The raw `out.push(<td>…)` must not survive — raw JSX is invalid plain JS.
    expect(cj).not.toMatch(/out\.push\(</)
    // …it lowers to a template-literal HTML string instead.
    expect(cj).toMatch(/out\.push\(`<td>/)
  })

  test('leaf text interpolations escape like the SSR JSX runtime (parity)', () => {
    // A JSX-runtime SSR adapter auto-escapes `{c}`; the client's HTML-string
    // lowering must escape the same position (renderPreamble's leaf door) or
    // special characters in data would parse as markup client-side only.
    // Byte-level parity is pinned by the map-array-builder-escaping fixture.
    //
    // Escaped ONCE, by the template emitter reading `contentKind` (absent =
    // text). This used to read `escapeText((c))` because a pre-pass rewrote
    // the IR expression to add the wrapper and the emitter left un-slotted
    // expressions alone; with the emitter deciding from IR, that pre-pass was
    // redundant and is gone. Exactly one wrapper is the invariant here — two
    // would double-escape, which is what removing the pre-pass prevents.
    const r = compile(arrayBuilder, false)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    expect(cj).toMatch(/out\.push\(`<td>\$\{escapeText\(c\)\}<\/td>`\)/)
    expect(cj).not.toContain('escapeText(escapeText(')
  })

  test('the element-array child {out} is joined into the row', () => {
    const r = compile(arrayBuilder, false)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    // `out` is an array of HTML strings; the child interpolation must join it,
    // not `String([])`-comma-collapse it.
    expect(cj).toMatch(/Array\.isArray\(out\)\s*\?\s*out\.join\(''\)/)
  })

  test('keyFn is hoisted from the returned root and derived from the raw item', () => {
    const r = compile(arrayBuilder, false)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    expect(cj).toMatch(/\(r\)\s*=>\s*String\(r\.id\)/)
  })

  test('DSL adapter refuses with BF021 naming the /* @client */ escape', () => {
    const r = compile(arrayBuilder, true)
    const bf021 = r.errors.filter(e => e.code === 'BF021')
    expect(bf021).toHaveLength(1)
    expect(bf021[0].suggestion?.message ?? '').toMatch(/@client/)
  })

  test('a /* @client */-marked array-builder compiles clean on a DSL adapter', () => {
    // The escape: the loop renders client-only (the DSL SSR adapter emits
    // markers, the browser runs the verbatim body), so the DSL refusal lifts.
    const src = `
function Table({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{/* @client */ rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { Table }
`
    const r = compile(src, true)
    expect(r.errors.filter(e => e.code === 'BF021')).toHaveLength(0)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    // The browser still runs the verbatim body — the leaf is a lowered string.
    expect(cj).toMatch(/out\.push\(`<td>/)
  })
})

describe('.map() array-builder — {out} join is scoped to the bare identifier', () => {
  test('only the bare {out} child joins; a property access on it does not', () => {
    // `{out}` is the element-array child and must join; `{out.length}` is a
    // number and must NOT get the array-join coercion (which would also
    // double-read the expression).
    const src = `
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}<td>{out.length}</td></tr>
  })}</tbody></table>
}
export { T }
`
    const r = compile(src, false)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    expect(cj).toMatch(/Array\.isArray\(out\)\s*\?\s*out\.join\(''\)/)
    expect(cj).not.toMatch(/Array\.isArray\(out\.length\)/)
  })
})

describe('.map() array-builder — D5 keyFn hoist contract', () => {
  test('a key derived from a preamble-computed local is refused', () => {
    // `k` is computed in the body; the key runs *before* the body, so it cannot
    // reference `k`. Refuse rather than emit an unbound keyFn.
    const src = `
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const k = r.id + '-row'
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={k}>{out}</tr>
  })}</tbody></table>
}
export { T }
`
    const r = compile(src, false)
    expect(r.errors.filter(e => e.code === 'BF021')).toHaveLength(1)
  })

  test('a key derived from a destructured preamble local is refused', () => {
    // The guard must see `k` even when it is bound via destructuring — else it
    // would compile to a keyFn referencing an unbound `k`.
    const src = `
function T({ rows }: { rows: { meta: { id: string }; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const { id: k } = r.meta
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={k}>{out}</tr>
  })}</tbody></table>
}
export { T }
`
    const r = compile(src, false)
    expect(r.errors.filter(e => e.code === 'BF021')).toHaveLength(1)
  })
})

describe('.map() array-builder — leaf scope (D-E: refuse what cannot be wired)', () => {
  test('a leaf with an event handler is refused (no silent divergence)', () => {
    const src = `
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td onClick={() => console.log(c)}>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { T }
`
    const r = compile(src, false)
    expect(r.errors.filter(e => e.code === 'BF021')).toHaveLength(1)
  })
})

describe('.map() arbitrary body — regression guards (unchanged)', () => {
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

  test('JSX in unreachable code after the return does not trip BF021', () => {
    const src = `
function List({ items }: { items: { id: string }[] }) {
  return <ul>{items.map((it) => {
    return <li key={it.id}>{it.id}</li>
    const dead = <span>{it.id}</span>
  })}</ul>
}
export { List }
`
    const r = compile(src, false)
    expect(r.errors.filter(e => e.code === 'BF021')).toHaveLength(0)
  })

  test('a plain single-return JSX body is unaffected on a DSL adapter', () => {
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
