// Rendering-side counterpart to `escape-coverage.test.ts` (#2613's
// "escape visibility" follow-up). That file is the FLOOR — every refusal
// is escapable-or-declared. This file asserts the render-conformance
// table actually SHOWS the difference: a refusal with a verified escape
// (`'escapable'`), one that's still open (`'debt'`), and one that owes no
// escape at all by design (`'not-owed'`) must render as three visually
// distinct things, not one flat diagnostic code.
//
// Two layers:
//   - `escapeMarker` is a pure function over a `FixtureDivergenceCell`'s
//     `escape` field — fast, synthetic input, no compiling.
//   - `buildFixtureDivergences` is exercised ONCE, at module scope, against
//     the REAL corpus and REAL adapters (same precedent as
//     `escape-coverage.test.ts` itself — that file's header comment
//     explains why this can't be faked without reimplementing the
//     compiler, and computes `loaded` once at module scope for the same
//     reason: every domain fixture's escape twin gets a real
//     `compileForCompat` call, so recomputing per-test would multiply an
//     already-heavy corpus compile by the test count). Named
//     `(fixture, adapter)` pairs known to sit in each of the three states
//     today are asserted individually, so a regression in
//     `classifyFixtureEscapeState` (wrong branch chosen, wrong twin
//     resolved) fails here, not just silently in prod docs.
//
// Picking a NAMED example per state (rather than only asserting "each
// state appears somewhere") is deliberate: a set-membership-only check
// would still pass if classification degenerated to "everything is
// 'debt'" for every fixture except one accidental survivor — naming the
// fixtures pins the actual claim being tested. The adapter each example
// lands on is never hardcoded, though — `findColumnInState` searches
// whichever columns `loadCompatAdapters()` actually resolved, the same
// additivity principle `escape-coverage-additivity.test.ts` backstops
// mechanically for the floor test itself: a 9th adapter is picked up here
// automatically, never requiring an edit to this file.

import { describe, expect, test } from 'bun:test'
import { jsxFixtures } from '../../../adapter-tests/fixtures'
import { loadCompatAdapters } from '../adapter-registry'
import {
  buildFixtureDivergences,
  ESCAPABLE_MARKER,
  escapeMarker,
  NOT_OWED_MARKER,
  type FixtureDivergenceCell,
} from '../report'

describe('escapeMarker — the three escape states render as three distinct things', () => {
  test('escapable renders the dagger marker', () => {
    expect(escapeMarker({ state: 'escapable', twin: 'some-fixture-client' })).toBe(ESCAPABLE_MARKER)
  })

  test('not-owed renders the double-dagger marker', () => {
    expect(escapeMarker({ state: 'not-owed', reason: 'because' })).toBe(NOT_OWED_MARKER)
  })

  test('debt renders unmarked — the pre-#2613 bare-code rendering', () => {
    expect(escapeMarker({ state: 'debt' })).toBe('')
  })

  test('no escape state (out-of-domain refusal, or a render-kind cell) renders unmarked', () => {
    expect(escapeMarker(undefined)).toBe('')
  })

  test('all three renderings are visually distinct characters', () => {
    const renderings = new Set([
      escapeMarker({ state: 'escapable', twin: 'x' }),
      escapeMarker({ state: 'not-owed', reason: 'x' }),
      escapeMarker({ state: 'debt' }),
    ])
    expect(renderings.size).toBe(3)
  })
})

const { loaded } = await loadCompatAdapters()
const fd = buildFixtureDivergences(loaded, jsxFixtures.length, jsxFixtures)

/** First adapter column on `fixtureId`'s row whose escape state is `state`, or undefined. */
function findColumnInState(
  fixtureId: string,
  state: 'escapable' | 'debt' | 'not-owed',
): { adapterId: string; cell: FixtureDivergenceCell } | undefined {
  const row = fd.fixtures[fixtureId]
  if (!row) return undefined
  for (const [adapterId, cell] of Object.entries(row)) {
    if (cell.escape?.state === state) return { adapterId, cell }
  }
  return undefined
}

describe('buildFixtureDivergences — real corpus, real adapters (#2613)', () => {
  test('at least one adapter loaded (a vacuous pass below would prove nothing)', () => {
    expect(loaded.length).toBeGreaterThan(0)
  })

  test('the render-conformance table exercises all three escape states', () => {
    const states = new Set<string>()
    for (const row of Object.values(fd.fixtures)) {
      for (const cell of Object.values(row)) {
        if (cell.escape) states.add(cell.escape.state)
      }
    }

    expect(states).toEqual(new Set(['escapable', 'debt', 'not-owed']))
  })

  // Named example 1: a refused fixture whose declared escape twin is
  // verified working on some real adapter — a supported path, not a dead
  // end, and rendered with `ESCAPABLE_MARKER`, not a bare code.
  test('every-typeof-predicate is escapable (with its declared twin) on at least one adapter', () => {
    const found = findColumnInState('every-typeof-predicate', 'escapable')
    expect(found).toBeDefined()
    expect(found!.cell.kind).toBe('refusal')
    expect(found!.cell.escape).toEqual({ state: 'escapable', twin: 'every-typeof-predicate-client' })
    expect(escapeMarker(found!.cell.escape)).toBe(ESCAPABLE_MARKER)
  })

  // Named example 2: refused, no working escape, and the adapter's own
  // pin says so with `unescapable` — tracked debt, rendered unmarked
  // (bare code) exactly as every refusal rendered before #2613.
  //
  // `static-array-from-props` (#2321), not `map-array-builder-body`: the
  // latter graduated to 'escapable' once `map-array-builder-body-client`
  // was verified against the real suites (#2613's array-builder twin
  // task) and every DSL adapter's `unescapable` pin for it was removed.
  test('static-array-from-props is tracked debt (adapter declares unescapable) on at least one adapter', () => {
    const found = findColumnInState('static-array-from-props', 'debt')
    expect(found).toBeDefined()
    expect(found!.cell.kind).toBe('refusal')
    expect(found!.cell.escape).toEqual({ state: 'debt' })
    expect(escapeMarker(found!.cell.escape)).toBe('')
  })

  // Named example 3: refused on every DSL adapter, and the fixture itself
  // declares `escapeNotOwed` — no escape will ever be authored (a
  // `/* @client */` twin would SSR nothing, defeating the fixture's own
  // hydration-adoption regression coverage). Rendered with
  // `NOT_OWED_MARKER`, never conflated with genuine open debt.
  test('tag-cloud owes no escape, by design, on at least one adapter', () => {
    const found = findColumnInState('tag-cloud', 'not-owed')
    expect(found).toBeDefined()
    expect(found!.cell.kind).toBe('refusal')
    expect((found!.cell.escape as { state: 'not-owed'; reason: string }).reason.length).toBeGreaterThan(0)
    expect(escapeMarker(found!.cell.escape)).toBe(NOT_OWED_MARKER)
  })

  test('a bare unmarked code and a marked one are textually different table cells', () => {
    // The whole point of the feature: two refusals must not render
    // identically when their escape stories differ.
    const cellToText = (cell: FixtureDivergenceCell | undefined): string =>
      cell && cell.kind === 'refusal' ? `${(cell.codes ?? []).join(', ')}${escapeMarker(cell.escape)}` : ''

    const debt = findColumnInState('static-array-from-props', 'debt')
    const escapable = findColumnInState('every-typeof-predicate', 'escapable')
    expect(debt).toBeDefined()
    expect(escapable).toBeDefined()

    const debtText = cellToText(debt!.cell)
    const escapableText = cellToText(escapable!.cell)
    expect(debtText).not.toBe('')
    expect(escapableText).not.toBe('')
    expect(debtText).not.toBe(escapableText)
    expect(escapableText.endsWith(ESCAPABLE_MARKER)).toBe(true)
    expect(debtText.endsWith(ESCAPABLE_MARKER)).toBe(false)
  })
})
