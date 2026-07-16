#!/usr/bin/env node
// @barefootjs/compat support-matrix generator — writes the deterministic
// `kind × axis × adapter` construct-support JSON to `ui/support-matrix.lock.json`.
//
// Invocation: `bun run packages/compat/src/support-matrix-cli.ts` (or via
// the root `support-matrix:lock` script). CI regenerates it and diffs —
// see `.github/workflows/ci-compat.yml`. Modeled on `cli.ts`'s
// `compat:lock` path (`--all --json --out ui/compat.lock.json`), but this
// artifact has no component/adapter selection to do — it's always the
// full join over the committed coverage map, so there's no flag surface.

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'node:url'
import path from 'path'
import { computeSupportMatrix, formatSupportMatrixJson } from './support-matrix'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const OUT_PATH = path.join(REPO_ROOT, 'ui/support-matrix.lock.json')

async function main(): Promise<void> {
  const report = await computeSupportMatrix()
  writeFileSync(OUT_PATH, formatSupportMatrixJson(report))

  const kindCount = Object.keys(report.kinds).length
  const axisCount = Object.keys(report.axes).length
  console.error(
    `Wrote support matrix → ${OUT_PATH} (${report.adapters.length} adapters, ${kindCount} kinds, ${axisCount} axes)`,
  )
}

if (import.meta.main) {
  await main()
}
