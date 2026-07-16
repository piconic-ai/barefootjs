// Pins the `coverage-map.json` × adapter-pins join in `support-matrix.ts`
// against small synthetic input (no real fixtures/adapters involved), plus
// a freshness gate mirroring `packages/adapter-tests/src/__tests__/coverage-map.test.ts`:
// `computeSupportMatrix()` must be deterministic across calls, and the
// committed `ui/support-matrix.lock.json` must equal a fresh
// `formatSupportMatrixJson(await computeSupportMatrix())`. CI additionally
// gates on `git diff --exit-code -- ui/support-matrix.lock.json` after
// regenerating (`.github/workflows/ci-compat.yml`) — this in-test check is
// defense so `bun test` alone catches drift too.

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PARSED_EXPR_KINDS } from '@barefootjs/jsx'
import {
  buildSupportMatrix,
  computeSupportMatrix,
  formatSupportMatrixJson,
  type SupportMatrixAdapterInput,
  type SupportMatrixCoverageMap,
} from '../src/support-matrix'

const LOCK_PATH = resolve(import.meta.dir, '../../../ui/support-matrix.lock.json')

/**
 * Three synthetic fixtures: `f1` exercises `call` + `literal:string`,
 * `f2` exercises only `call`, `f3` exercises only `literal:string`. No
 * other `PARSED_EXPR_KINDS` entry (e.g. `identifier`, `regex`) is
 * exercised by anything here — those stay at `total: 0` in the report,
 * exactly like the real `regex` row.
 */
function syntheticCoverage(): SupportMatrixCoverageMap {
  return {
    fixtures: {
      f1: { kinds: ['call'], axes: ['literal:string'] },
      f2: { kinds: ['call'], axes: [] },
      f3: { kinds: [], axes: ['literal:string'] },
    },
    kindCounts: { call: 2 },
    axisCounts: { 'literal:string': 2 },
    uncoveredKinds: ['regex'],
  }
}

/**
 * Three synthetic adapters, deliberately given non-alphabetical / non-hono-
 * first ids (`zeta`, `hono`, `alpha`) to pin the column-ordering contract
 * too. `hono` pins `f1` with three diagnostics: two carrying issue URLs
 * (one duplicated, to pin dedup) in reverse sort order (to pin the sort),
 * and one carrying no issue (to pin that a pin can still gap a fixture
 * with an empty issues contribution). `alpha` declares no pins but a
 * `renderDivergences` entry for `f3` (to pin that render-divergence-only
 * gaps carry `issues: []`, since that map has no issue field at all).
 * `zeta` declares neither, so every cell on it is clean.
 */
function syntheticAdapters(): SupportMatrixAdapterInput[] {
  return [
    { id: 'zeta', pins: {}, renderDivergences: {} },
    {
      id: 'hono',
      pins: {
        f1: [
          { code: 'BF1', severity: 'error', issue: 'https://example.com/issues/2' },
          { code: 'BF2', severity: 'error', issue: 'https://example.com/issues/1' },
          { code: 'BF3', severity: 'warning', issue: 'https://example.com/issues/1' },
          { code: 'BF4', severity: 'warning' },
        ],
      },
      renderDivergences: {},
    },
    { id: 'alpha', pins: {}, renderDivergences: { f3: 'renders differently from the reference' } },
  ]
}

describe('buildSupportMatrix (synthetic join)', () => {
  const report = buildSupportMatrix(syntheticCoverage(), syntheticAdapters())

  test('adapter columns: hono first, then alphabetical', () => {
    expect(report.adapters).toEqual(['hono', 'alpha', 'zeta'])
  })

  test('kinds cover every PARSED_EXPR_KINDS entry, sorted', () => {
    expect(Object.keys(report.kinds)).toEqual([...PARSED_EXPR_KINDS].sort())
  })

  test('a covered kind: total + ratio + gap drill-down', () => {
    const call = report.kinds.call
    expect(call.total).toBe(2) // f1, f2

    // zeta: no pins/divergences anywhere — fully clean.
    expect(call.cells.zeta).toEqual({ pass: 2, total: 2 })

    // alpha: no pins on f1/f2 either — clean, even though it has an
    // unrelated renderDivergence on f3 (which doesn't exercise `call`).
    expect(call.cells.alpha).toEqual({ pass: 2, total: 2 })

    // hono: f1 gapped via pins, f2 clean. Issues dedup+sorted.
    expect(call.cells.hono).toEqual({
      pass: 1,
      total: 2,
      gaps: [{ fixture: 'f1', issues: ['https://example.com/issues/1', 'https://example.com/issues/2'] }],
    })
  })

  test('an axis: total + ratio + render-divergence gap with no issue URL', () => {
    const axis = report.axes['literal:string']
    expect(axis.total).toBe(2) // f1, f3

    // zeta: clean.
    expect(axis.cells.zeta).toEqual({ pass: 2, total: 2 })

    // hono: f1 gapped via pins (same fixture, same issues as the `call` case).
    expect(axis.cells.hono).toEqual({
      pass: 1,
      total: 2,
      gaps: [{ fixture: 'f1', issues: ['https://example.com/issues/1', 'https://example.com/issues/2'] }],
    })

    // alpha: f3 gapped via renderDivergences only — no issue URL available.
    expect(axis.cells.alpha).toEqual({
      pass: 1,
      total: 2,
      gaps: [{ fixture: 'f3', issues: [] }],
    })
  })

  test('an uncovered construct reports total: 0 with no gaps, for every adapter', () => {
    // `identifier` isn't exercised by any synthetic fixture — same shape
    // the real matrix gives `regex` (packages/adapter-tests/coverage-map.json's
    // uncoveredKinds).
    const identifier = report.kinds.identifier
    expect(identifier.total).toBe(0)
    for (const adapterId of report.adapters) {
      expect(identifier.cells[adapterId]).toEqual({ pass: 0, total: 0 })
    }
  })

  test('axes are exactly coverage.axisCounts keys (no uncovered-axis row)', () => {
    expect(Object.keys(report.axes)).toEqual(['literal:string'])
  })
})

describe('support matrix freshness', () => {
  test('computeSupportMatrix() is deterministic across calls', async () => {
    const a = await computeSupportMatrix()
    const b = await computeSupportMatrix()
    expect(a).toEqual(b)
  })

  test('committed ui/support-matrix.lock.json matches a fresh computeSupportMatrix()', async () => {
    const committed = readFileSync(LOCK_PATH, 'utf8')
    const fresh = formatSupportMatrixJson(await computeSupportMatrix())
    expect(fresh).toBe(committed)
  })
})
