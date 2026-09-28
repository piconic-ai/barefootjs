/**
 * Regenerate `packages/adapter-tests/coverage-map.json` — the committed
 * kind/axis/context coverage ledger (`spec/subset-conformance.md`).
 * The freshness meta-test (`__tests__/coverage-map.test.ts`) fails when
 * the committed file drifts from a recomputation; run this to update:
 *
 *   bun packages/adapter-tests/scripts/coverage-map.ts
 *
 * The file holds per-fixture facts only; the summary counts printed below
 * are computed from them (`computeCoverageCounts`) and never committed.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PARSED_EXPR_KINDS } from '@barefootjs/jsx'
import { computeCoverageMap } from '../src/coverage-map'
import { computeCoverageCounts } from '../src/coverage-map-counts'

const outPath = resolve(import.meta.dir, '../coverage-map.json')
const map = computeCoverageMap()
writeFileSync(outPath, `${JSON.stringify(map, null, 2)}\n`)
const counts = computeCoverageCounts(map)
const uncoveredKinds = PARSED_EXPR_KINDS.filter(k => !counts.kindCounts[k]).sort()
console.log(
  `coverage-map.json: ${counts.fixtureCount} fixtures, ` +
    `${Object.keys(counts.kindCounts).length}/${PARSED_EXPR_KINDS.length} kinds covered, ` +
    `${Object.keys(counts.axisCounts).length} axes` +
    (uncoveredKinds.length ? `; uncovered: ${uncoveredKinds.join(', ')}` : ''),
)
