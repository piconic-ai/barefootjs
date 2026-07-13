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
import { PARSED_EXPR_KINDS } from '@barefootjs/jsx'
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

const MAP_PATH = resolve(import.meta.dir, '../../coverage-map.json')

describe('coverage ledger', () => {
  const recomputed = computeCoverageMap()

  test('committed coverage-map.json is fresh', () => {
    const committed = JSON.parse(readFileSync(MAP_PATH, 'utf8'))
    // toEqual's diff on the full map is unreadable; compare the cheap
    // aggregate first so the failure names what moved.
    expect(Object.keys(committed.fixtures)).toEqual(Object.keys(recomputed.fixtures))
    expect(committed.kindCounts).toEqual(recomputed.kindCounts)
    expect(committed.axisCounts).toEqual(recomputed.axisCounts)
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
})
