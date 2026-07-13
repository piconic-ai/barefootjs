/**
 * Regenerate `packages/adapter-tests/generated-data-points.json` — the
 * committed type-derived adversarial points (`spec/subset-conformance.md`
 * roadmap 3). The freshness meta-test
 * (`__tests__/generated-data-points.test.ts`) fails when the committed
 * file drifts from a recomputation; run this to update:
 *
 *   bun packages/adapter-tests/scripts/generate-data-points.ts
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateAllDataPoints } from '../src/adversarial-catalog'

const outPath = resolve(import.meta.dir, '../generated-data-points.json')
const points = generateAllDataPoints()
writeFileSync(outPath, `${JSON.stringify(points, null, 2)}\n`)
const total = Object.values(points).reduce((n, ps) => n + ps.length, 0)
console.log(`generated-data-points.json: ${total} points across ${Object.keys(points).length} fixtures`)
