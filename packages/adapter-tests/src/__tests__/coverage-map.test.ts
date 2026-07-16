/**
 * Coverage-ledger meta-tests (`spec/subset-conformance.md`).
 *
 * The committed `coverage-map.json` is the queryable record of which
 * `ParsedExpr` kinds / axes / contexts each conformance fixture
 * exercises. Two invariants hold it together:
 *
 * 1. **Freshness** — the committed file equals a recomputation from the
 *    current fixtures + compiler, so the ledger can never silently
 *    drift from reality (regen:
 *    `bun packages/adapter-tests/scripts/coverage-map.ts`).
 * 2. **Ledger floor** — every kind in the `PARSED_EXPR_KINDS` registry
 *    is exercised by at least one fixture OR carries a documented
 *    exclusion below. A kind-level floor is bookkeeping, not behavioral
 *    coverage (axes and data points carry that) — its job is to make
 *    "nothing tests X" impossible to be true silently.
 */

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PARSED_EXPR_KINDS, ARRAY_METHOD_NAMES } from '@barefootjs/jsx'
import { computeCoverageMap } from '../coverage-map'

/**
 * Registry kinds allowed to stay uncovered, each with the reason. An
 * entry whose kind gains coverage becomes STALE and fails the floor
 * test until deleted — graduation is an explicit ledger event.
 */
const UNCOVERED_KIND_ALLOWLIST: Record<string, string> = {
  // Produced only as the carrier for the one recognised regex shape —
  // `String.replace(/\/+$/, '')` trailing-slash strip (#2039) — which
  // no shared fixture exercises in a parsed position yet; any other
  // regex falls through to `unsupported` at parse time.
  regex: 'no fixture exercises the trailing-slash String.replace pattern',
}

/**
 * Catalogued `array-method` names allowed to stay uncovered, each with the
 * reason — the catalogue-half floor's counterpart to
 * `UNCOVERED_KIND_ALLOWLIST`. Empty today: every method in
 * `ARRAY_METHOD_NAMES` has a covering fixture. A method that gains a fixture
 * while listed here becomes STALE and fails the no-stale test until deleted.
 */
const UNCOVERED_ARRAY_METHOD_ALLOWLIST: Record<string, string> = {}

const MAP_PATH = resolve(import.meta.dir, '../../coverage-map.json')

describe('coverage ledger', () => {
  const recomputed = computeCoverageMap()

  test('committed coverage-map.json is fresh', () => {
    const committed = JSON.parse(readFileSync(MAP_PATH, 'utf8'))
    // toEqual's diff on the full 4000-line map is unreadable — walk
    // per fixture so a drift failure names the fixture and carries the
    // regen command.
    const REGEN = 'regen: bun packages/adapter-tests/scripts/coverage-map.ts'
    const ids = new Set([...Object.keys(committed.fixtures ?? {}), ...Object.keys(recomputed.fixtures)])
    for (const id of ids) {
      const a = committed.fixtures?.[id]
      const b = recomputed.fixtures[id]
      if (!Bun.deepEquals(a, b)) {
        throw new Error(
          `coverage-map.json is stale for fixture '${id}':\n` +
            `  committed:  ${JSON.stringify(a)}\n` +
            `  recomputed: ${JSON.stringify(b)}\n${REGEN}`,
        )
      }
    }
    if (!Bun.deepEquals(committed, recomputed)) {
      throw new Error(`coverage-map.json aggregates are stale (kindCounts/axisCounts/uncoveredKinds). ${REGEN}`)
    }
    expect(committed).toEqual(recomputed)
  })

  test('every ParsedExpr kind is exercised or documented uncovered', () => {
    const holes = PARSED_EXPR_KINDS.filter(
      kind => !recomputed.kindCounts[kind] && !(kind in UNCOVERED_KIND_ALLOWLIST),
    )
    expect(holes).toEqual([])
  })

  test('no stale allowlist entries (covered kinds must graduate)', () => {
    const stale = Object.keys(UNCOVERED_KIND_ALLOWLIST).filter(
      kind => (recomputed.kindCounts[kind] ?? 0) > 0,
    )
    expect(stale).toEqual([])
  })

  // Catalogue-half floor (#2276): every catalogued `array-method` name is
  // exercised by ≥1 fixture, or carries a documented exclusion. Mirrors the
  // kind floor — the mechanical backstop for the change-time coupling rule
  // on the largest catalogue, since (unlike kinds) an `array-method`
  // variant has no exhaustive adapter switch that would otherwise force it.
  test('every catalogued array-method is exercised by ≥1 fixture or documented uncovered', () => {
    const holes = ARRAY_METHOD_NAMES.filter(
      method =>
        !recomputed.axisCounts[`array-method:${method}`] &&
        !(method in UNCOVERED_ARRAY_METHOD_ALLOWLIST),
    )
    expect(holes).toEqual([])
  })

  test('no stale array-method allowlist entries (covered methods must graduate)', () => {
    const stale = Object.keys(UNCOVERED_ARRAY_METHOD_ALLOWLIST).filter(
      method => (recomputed.axisCounts[`array-method:${method}`] ?? 0) > 0,
    )
    expect(stale).toEqual([])
  })
})
