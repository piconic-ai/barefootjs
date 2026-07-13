/**
 * Regenerate `packages/adapter-tests/coverage-map.json` — the committed
 * kind/axis/context coverage ledger (`spec/subset-conformance.md`).
 * The freshness meta-test (`__tests__/coverage-map.test.ts`) fails when
 * the committed file drifts from a recomputation; run this to update:
 *
 *   bun packages/adapter-tests/scripts/coverage-map.ts
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeCoverageMap } from '../src/coverage-map'

const outPath = resolve(import.meta.dir, '../coverage-map.json')
const map = computeCoverageMap()
writeFileSync(outPath, `${JSON.stringify(map, null, 2)}\n`)
console.log(
  `coverage-map.json: ${Object.keys(map.fixtures).length} fixtures, ` +
    `${Object.keys(map.kindCounts).length}/${Object.keys(map.kindCounts).length + map.uncoveredKinds.length} kinds covered, ` +
    `${Object.keys(map.axisCounts).length} axes` +
    (map.uncoveredKinds.length ? `; uncovered: ${map.uncoveredKinds.join(', ')}` : ''),
)
