/**
 * Unit coverage for `findAssignedNames` / `closeOverWritersOfMutableBindings`
 * (#2598).
 *
 * The e2e half lives in `packages/vite/src/__tests__/mutable-binding-writers.test.ts`
 * (real `vite build`, emitted template type-checked). This half pins what an
 * e2e fixture can't isolate: which syntactic forms count as a WRITE, and the
 * reads/false matches that must not. Those negative cases are why this uses
 * the AST — a regex for `name\s*=` would match every one of them.
 */
import { describe, test, expect } from 'bun:test'
import { findAssignedNames, closeOverWritersOfMutableBindings } from '../module-exports.ts'

const candidates = (...names: string[]) => new Set(names)

describe('findAssignedNames', () => {
  test('plain assignment', () => {
    expect([...findAssignedNames(`el = node`, candidates('el'))]).toEqual(['el'])
  })

  test('compound assignment', () => {
    expect([...findAssignedNames(`seq += 1`, candidates('seq'))]).toEqual(['seq'])
  })

  test('logical assignment', () => {
    expect([...findAssignedNames(`cached ??= build()`, candidates('cached'))]).toEqual(['cached'])
  })

  test('postfix and prefix update', () => {
    expect([...findAssignedNames(`a++`, candidates('a'))]).toEqual(['a'])
    expect([...findAssignedNames(`--b`, candidates('b'))]).toEqual(['b'])
  })

  test('assignment nested inside a function body', () => {
    const body = `(el) => { if (el) { highlightEl = el } }`
    expect([...findAssignedNames(body, candidates('highlightEl'))]).toEqual(['highlightEl'])
  })

  test('reports only the candidates asked about', () => {
    const body = `a = 1; b = 2; c = 3`
    expect([...findAssignedNames(body, candidates('b'))]).toEqual(['b'])
  })

  test('a read is not a write', () => {
    expect([...findAssignedNames(`const x = el`, candidates('el'))]).toEqual([])
  })

  test('a comparison is not a write', () => {
    expect([...findAssignedNames(`if (el == null) {}`, candidates('el'))]).toEqual([])
    expect([...findAssignedNames(`if (el === other) {}`, candidates('el'))]).toEqual([])
  })

  test('a property write through the binding is not a write TO it', () => {
    // `el` keeps whatever it already held — this cannot be what gives a
    // never-narrowed binding its value.
    expect([...findAssignedNames(`el.scrollTop = 0`, candidates('el'))]).toEqual([])
  })

  test('a same-named property key is not a write', () => {
    expect([...findAssignedNames(`const o = { el: 1 }`, candidates('el'))]).toEqual([])
  })

  test('`name=` inside a string or JSX attribute is not a write', () => {
    expect([...findAssignedNames(`const s = "el = node"`, candidates('el'))]).toEqual([])
    expect([...findAssignedNames(`<div data-x="el = node" />`, candidates('el'))]).toEqual([])
  })

  test('no candidates means no parse and no results', () => {
    expect([...findAssignedNames(`el = node`, candidates())]).toEqual([])
  })
})

describe('closeOverWritersOfMutableBindings', () => {
  // `declarations` carries the local `let` bindings themselves alongside the
  // functions, exactly as the adapter builds it (localConstants +
  // localFunctions) — a binding only counts as "surviving" if it is in this
  // list and reachable.
  const decls = [
    { name: 'binding', body: `null` },
    // Reachable from the rendered JSX below.
    { name: 'reader', body: `() => { if (binding) return binding.x; return 0 }` },
    // Reachable ONLY through a stripped attribute — the writer.
    { name: 'writer', body: `(el) => { binding = el }` },
    // Reachable from nothing at all; must stay pruned.
    { name: 'orphan', body: `() => { unrelated = 1 }` },
  ]
  const rendered = `<div onScroll={reader} />`

  test('pulls in the writer of a surviving mutable binding', () => {
    const out = closeOverWritersOfMutableBindings(rendered, decls, new Set(['binding']))
    expect(out.has('reader')).toBe(true)
    expect(out.has('writer')).toBe(true)
  })

  test('leaves declarations that write nothing reachable alone', () => {
    const out = closeOverWritersOfMutableBindings(rendered, decls, new Set(['binding']))
    expect(out.has('orphan')).toBe(false)
  })

  test('does not retain a writer when the binding itself was pruned', () => {
    // Nothing references `binding`, so it is not emitted and its writer is
    // dead client-only code — the pruning this feature must not undo.
    const out = closeOverWritersOfMutableBindings(`<div />`, decls, new Set(['binding']))
    expect(out.has('writer')).toBe(false)
    expect(out.has('reader')).toBe(false)
  })

  test('is a no-op when nothing is mutable', () => {
    const withMutables = closeOverWritersOfMutableBindings(rendered, decls, new Set(['binding']))
    const withoutMutables = closeOverWritersOfMutableBindings(rendered, decls, new Set())
    expect(withoutMutables.has('writer')).toBe(false)
    expect(withMutables.has('writer')).toBe(true)
  })

  test('reaches a writer that is only retained transitively', () => {
    // `outerWriter` writes `a`; retaining it makes `b` reachable, whose own
    // writer must then come along too — one round is not enough.
    const chained = [
      { name: 'a', body: `null` },
      { name: 'b', body: `null` },
      { name: 'reader', body: `() => (a ? a.x : 0)` },
      { name: 'outerWriter', body: `(el) => { a = el; touch(b) }` },
      { name: 'innerWriter', body: `(el) => { b = el }` },
    ]
    const out = closeOverWritersOfMutableBindings(
      `<div onScroll={reader} />`,
      chained,
      new Set(['a', 'b']),
    )
    expect(out.has('outerWriter')).toBe(true)
    expect(out.has('innerWriter')).toBe(true)
  })
})
