import { describe, test, expect } from 'bun:test'
import { evaluateSignalInit, tryEvaluateSignalInit } from '../signal-init-eval'

// #2209: replaces 7 near-duplicate regex-based `evaluateSignalInit`
// evaluators (one per template-string adapter's test-render.ts harness)
// with a single sandboxed real-JS evaluator. Absorbs and supersedes
// `packages/adapter-mojolicious/src/__tests__/evaluate-signal-init.test.ts`
// (#1672's pins) plus the actual #2209 repro shape.
describe('evaluateSignalInit (#2209)', () => {
  test('the #2209 repro: (props.x ?? []).map(t => ({ ...t, editing: false }))', () => {
    const expr = `(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))`
    expect(evaluateSignalInit(expr, { initialTodos: [{ id: 1, done: false }] })).toEqual([
      { id: 1, done: false, editing: false },
    ])
    expect(evaluateSignalInit(expr, undefined)).toEqual([])
    expect(evaluateSignalInit(expr, {})).toEqual([])
  })

  test('an object-spread override applies after the spread (matches JS semantics)', () => {
    const expr = `(props.items ?? []).map(t => ({ ...t, done: true }))`
    expect(evaluateSignalInit(expr, { items: [{ id: 1, done: false }] })).toEqual([
      { id: 1, done: true },
    ])
  })

  // #1672 pins, absorbed from the deleted mojolicious-local test file.
  test('parses an inline object-array initial value', () => {
    expect(evaluateSignalInit(`[{ id: 'a' }, { id: 'b' }, { id: 'c' }]`)).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ])
  })

  test('parses scalar and mixed arrays, including nested objects', () => {
    expect(evaluateSignalInit(`['x', 'y']`)).toEqual(['x', 'y'])
    expect(evaluateSignalInit(`[1, 2, 3]`)).toEqual([1, 2, 3])
    expect(evaluateSignalInit(`[{ id: 'a', n: 1, ok: true }]`)).toEqual([
      { id: 'a', n: 1, ok: true },
    ])
  })

  test('still parses scalars, empty array, and props passthrough', () => {
    expect(evaluateSignalInit(`'b'`)).toBe('b')
    expect(evaluateSignalInit(`5`)).toBe(5)
    expect(evaluateSignalInit(`[]`)).toEqual([])
    expect(evaluateSignalInit(`props.value`, { value: 42 })).toBe(42)
  })

  test('bails to null for arrays with non-literal, unbound elements', () => {
    expect(evaluateSignalInit(`[foo(), bar]`)).toBeNull()
  })

  // Additional shapes the old regex evaluators supported.
  test('props.x ?? default with x present, absent, or explicitly null', () => {
    expect(evaluateSignalInit(`props.x ?? 7`, { x: 3 })).toBe(3)
    expect(evaluateSignalInit(`props.x ?? 7`, {})).toBe(7)
    expect(evaluateSignalInit(`props.x ?? 7`, undefined)).toBe(7)
    // Fix over the old regex evaluators: JS `??` also falls through on an
    // explicit `null`/`undefined` prop value — the old regex only checked
    // `propName in props` and returned the raw (null) value, which was
    // actually a bug relative to real JS `??` semantics.
    expect(evaluateSignalInit(`props.x ?? 7`, { x: null })).toBe(7)
  })

  test('negative and decimal number literals', () => {
    expect(evaluateSignalInit(`-7.6`)).toBe(-7.6)
    expect(evaluateSignalInit(`42`)).toBe(42)
  })

  test('booleans', () => {
    expect(evaluateSignalInit(`true`)).toBe(true)
    expect(evaluateSignalInit(`false`)).toBe(false)
  })

  test('an explicit null initializer maps to null (the "skip" outcome)', () => {
    expect(evaluateSignalInit(`null`)).toBeNull()
  })

  // New coverage for #2209's sandboxing contract.
  test('blocked globals fail deterministically and fall back to null', () => {
    expect(evaluateSignalInit(`Date.now()`)).toBeNull()
    expect(evaluateSignalInit(`Math.random()`)).toBeNull()
    expect(evaluateSignalInit(`typeof window`)).not.toBe('object')
  })

  test('a TS-only remnant that fails to parse as an expression falls back to null', () => {
    expect(evaluateSignalInit(`foo as Bar`)).toBeNull()
  })

  test('a non-transportable value (class instance) falls back to null', () => {
    expect(evaluateSignalInit(`new Set([1, 2])`)).toBeNull()
  })

  test('a bare destructured-prop identifier (not props.x) is unbound and falls back to null', () => {
    expect(evaluateSignalInit(`count`, { count: 5 })).toBeNull()
  })

  test('tryEvaluateSignalInit distinguishes an explicit undefined from a real ok:false', () => {
    expect(tryEvaluateSignalInit(`undefined`)).toEqual({ ok: true, value: undefined })
    expect(tryEvaluateSignalInit(`foo()`)).toEqual({ ok: false })
    // evaluateSignalInit's wrapper collapses both to null:
    expect(evaluateSignalInit(`undefined`)).toBeNull()
    expect(evaluateSignalInit(`foo()`)).toBeNull()
  })

  // Copilot review (#2229): `Function` is now shadowed too — closes the
  // most direct bypass of the blocked-globals list.
  test('the Function constructor is shadowed', () => {
    expect(evaluateSignalInit(`Function('return 1')()`)).toBeNull()
  })

  // Copilot review (#2229): `isTransportable` must reject a sparse array
  // (a hole is not the same as an element that's explicitly `undefined` —
  // `Array.prototype.every` silently skips holes, which previously let
  // one through undetected).
  test('a sparse array (a hole, not an explicit undefined) falls back to null', () => {
    // biome-ignore lint: intentional sparse-array literal for the hole test
    expect(evaluateSignalInit(`[1, , 3]`)).toBeNull()
  })

  // Copilot review (#2229): the same object appearing twice in a
  // non-cyclic shape (shared by reference, not by cycle) is transportable
  // — JSON-equivalent behavior would just duplicate it — and must NOT be
  // rejected by an overly-global "seen" set.
  test('a shared (non-cyclic) reference is transportable', () => {
    expect(evaluateSignalInit(`(() => { const shared = { id: 1 }; return [shared, shared] })()`)).toEqual([
      { id: 1 },
      { id: 1 },
    ])
  })

  test('a genuine cycle still falls back to null', () => {
    expect(
      evaluateSignalInit(`(() => { const o = { id: 1 }; o.self = o; return o })()`),
    ).toBeNull()
  })
})
