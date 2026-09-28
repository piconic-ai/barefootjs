#!/usr/bin/env bun
/**
 * Swap the Vite a CI leg runs against to one major, then verify it.
 *
 * The workspace pins its devDependencies to one Vite major, but the `vite`
 * peer range admits several (see scripts/lib/vite-peer.ts). For each
 * package that declares the peer, plus any extra directory given (e.g.
 * integrations/csr), this runs `bun add --dev vite@^<major>` and then fails
 * if `vite` in that directory resolved to another major, so a leg can never
 * silently test the wrong Vite.
 *
 * Usage: bun scripts/ci/use-vite-major.ts <major> [extraDir...]
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { $ } from 'bun'
import { vitePeerPackages } from '../lib/vite-peer'

const [majorArg, ...extraDirs] = process.argv.slice(2)
if (!majorArg || !/^\d+$/.test(majorArg)) {
  console.error('Usage: bun scripts/ci/use-vite-major.ts <major> [extraDir...]')
  process.exit(2)
}

const repoRoot = resolve(import.meta.dir, '..', '..')
const dirs = [...vitePeerPackages(repoRoot).map(p => p.rel), ...extraDirs]

for (const dir of dirs) {
  await $`bun add --dev ${`vite@^${majorArg}`}`.cwd(join(repoRoot, dir)).quiet()
}

let failed = false
for (const dir of dirs) {
  const { version } = JSON.parse(readFileSync(join(repoRoot, dir, 'node_modules', 'vite', 'package.json'), 'utf8'))
  const ok = version.split('.')[0] === majorArg
  console.log(`${dir}: vite@${version}${ok ? '' : ` (expected ${majorArg}.x)`}`)
  if (!ok) failed = true
}
if (failed) {
  console.error(`::error::vite did not resolve to ${majorArg}.x everywhere`)
  process.exit(1)
}
