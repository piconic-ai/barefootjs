// Rendering-side counterpart to `escape-coverage.test.ts` (#2613's
// "escape visibility" follow-up, inverted per maintainer feedback so the
// check mark answers "does it work?" FIRST — issue info moves to the
// per-fixture detail list, not the cell). That file is the FLOOR — every
// refusal is escapable-or-declared. This file asserts the render-
// conformance table actually SHOWS the difference: a refusal with a
// verified escape WORKS (`✓†`, no diagnostic code in the cell), one
// that's still open (`'debt'`) or owed by design (`'not-owed'`) does NOT
// work and keeps its bare/marked code, and a render divergence (`≠`) is
// its own third thing — three visually distinct outcomes, not one flat
// diagnostic code.
//
// Two layers:
//   - `escapeMarker` / `fixtureCellText` / `rowWorksEverywhere` are pure
//     functions over a `FixtureDivergenceCell` (or a row of them) — fast,
//     synthetic input, no compiling.
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
  fixtureCellText,
  NOT_OWED_MARKER,
  rowWorksEverywhere,
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

describe('fixtureCellText — the check mark answers "does it work?" first', () => {
  test('a clean (absent) cell renders the plain checkmark', () => {
    expect(fixtureCellText(undefined)).toBe('✓')
  })

  test('a render divergence renders the divergence marker, not a checkmark', () => {
    expect(fixtureCellText({ kind: 'render', reason: 'whitespace differs' })).toBe('≠')
  })

  test('an escapable refusal renders WORKS (✓†) — no diagnostic code in the cell', () => {
    const text = fixtureCellText({
      kind: 'refusal',
      codes: ['BF101'],
      escape: { state: 'escapable', twin: 'some-fixture-client' },
    })
    expect(text).toBe(`✓${ESCAPABLE_MARKER}`)
    expect(text).not.toContain('BF101')
  })

  test('a debt refusal keeps its bare diagnostic code, unmarked', () => {
    expect(fixtureCellText({ kind: 'refusal', codes: ['BF101'], escape: { state: 'debt' } })).toBe('BF101')
  })

  test('a not-owed refusal keeps its diagnostic code, marked with the double dagger', () => {
    expect(
      fixtureCellText({ kind: 'refusal', codes: ['BF021'], escape: { state: 'not-owed', reason: 'because' } }),
    ).toBe(`BF021${NOT_OWED_MARKER}`)
  })

  test('an out-of-domain refusal (no escape field) keeps its bare code, same as debt', () => {
    expect(fixtureCellText({ kind: 'refusal', codes: ['BF021'] })).toBe('BF021')
  })
})

describe('rowWorksEverywhere — decides which fixtures need a row in the "needs attention" table', () => {
  test('a row where every cell is escapable works everywhere', () => {
    expect(
      rowWorksEverywhere({
        hono: { kind: 'refusal', codes: ['BF101'], escape: { state: 'escapable', twin: 'x' } },
        blade: { kind: 'refusal', codes: ['BF101'], escape: { state: 'escapable', twin: 'x' } },
      }),
    ).toBe(true)
  })

  test('a row with one debt cell needs attention, even if every other cell is escapable', () => {
    expect(
      rowWorksEverywhere({
        hono: { kind: 'refusal', codes: ['BF101'], escape: { state: 'escapable', twin: 'x' } },
        blade: { kind: 'refusal', codes: ['BF101'], escape: { state: 'debt' } },
      }),
    ).toBe(false)
  })

  test('a row with a render divergence needs attention', () => {
    expect(
      rowWorksEverywhere({
        blade: { kind: 'render', reason: 'diverges' },
      }),
    ).toBe(false)
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

  test('an escapable cell reads as WORKING (✓†) and carries no diagnostic code — a debt cell keeps its code', () => {
    // The whole point of the inverted rendering (maintainer feedback,
    // #2613 follow-up): a genuinely working construct must not read as a
    // failure by leading with an error code, and the code that DOES still
    // fail must stay visibly distinct from it.
    //
    // Debt example is `static-array-from-props` (#2321), not
    // `map-array-builder-body`: #2623 graduated the latter to escapable,
    // so naming it here would assert the opposite of what it now is.
    const debt = findColumnInState('static-array-from-props', 'debt')
    const escapable = findColumnInState('every-typeof-predicate', 'escapable')
    expect(debt).toBeDefined()
    expect(escapable).toBeDefined()

    const debtText = fixtureCellText(debt!.cell)
    const escapableText = fixtureCellText(escapable!.cell)
    expect(debtText).toBe((debt!.cell.codes ?? []).join(', '))
    expect(escapableText).toBe(`✓${ESCAPABLE_MARKER}`)
    expect(escapableText).not.toContain(debtText)
    expect(debtText).not.toBe(escapableText)
  })

  // Named example 4: every-typeof-predicate is refused on some adapters
  // (with a verified escape) and compiles clean on the rest — it works on
  // EVERY adapter, so `rowWorksEverywhere` must say so and it must not
  // appear in the "needs attention" table.
  // The negative case is `static-array-from-props` (#2321), NOT
  // `map-array-builder-body`: #2623 gave the latter a verified escape on
  // all eight DSL adapters, so it now works everywhere and asserting
  // `false` for it would be asserting the opposite of the truth. Picking a
  // still-genuinely-broken fixture keeps this test meaningful rather than
  // merely green.
  test('every-typeof-predicate works everywhere (rowWorksEverywhere), static-array-from-props does not', () => {
    expect(fd.fixtures['every-typeof-predicate']).toBeDefined()
    expect(rowWorksEverywhere(fd.fixtures['every-typeof-predicate']!)).toBe(true)

    expect(fd.fixtures['static-array-from-props']).toBeDefined()
    expect(rowWorksEverywhere(fd.fixtures['static-array-from-props']!)).toBe(false)

    // And the fixture that just graduated is now on the working side —
    // pinning the #2623 graduation as observable through this renderer.
    expect(fd.fixtures['map-array-builder-body']).toBeDefined()
    expect(rowWorksEverywhere(fd.fixtures['map-array-builder-body']!)).toBe(true)
  })
})
