#!/usr/bin/env bun
//
// Refuse a release before anything is published if a package about to ship
// does not yet exist on npm or JSR. See `scripts/lib/release-preflight.ts`
// for why, and for the exact instructions the operator gets.
//
// Runs first in `release:publish` (package.json), ahead of the build, so a
// refused run costs seconds and publishes nothing: `published` stays false,
// the native-registry jobs stay skipped, and once the registries are set up a
// plain re-run of the same workflow run completes the release normally.
//
// Usage:
//   bun scripts/release-preflight.ts
//
// Exit: 0 every package exists (or a registry could not be reached — that is
// reported, never treated as missing); 1 at least one package is missing.

import { resolve } from 'node:path'
import { $ } from 'bun'
import { discoverJsrPackages, jsrPackagePresence } from './lib/jsr-packages'
import { npmPublishablePackages, npmRegistryVersion } from './lib/npm-packages'
import { type PreflightEntry, assessPreflight } from './lib/release-preflight'

const repoRoot = resolve(import.meta.dir, '..')

const { jsrPublishable } = discoverJsrPackages(repoRoot)

// Sequential on purpose, like changeset-publish.ts's loop. Two dozen
// concurrent `npm view` processes plus as many jsr.io fetches is a burst
// that can earn a 429 — and a rate-limited lookup lands in `unknown`, which
// never blocks, so the burst would quietly turn the check into "did not
// check". Once per release, ~1s per package, this is not worth optimizing.
const entries: PreflightEntry[] = []
for (const { rel, pkg } of npmPublishablePackages(repoRoot)) {
  entries.push({
    name: pkg.name,
    version: pkg.version,
    dir: rel,
    npm: await npmRegistryVersion(pkg.name),
    jsr: jsrPublishable.has(pkg.name) ? await jsrPackagePresence(pkg.name) : null,
  })
}

// The commit the instructions should name: what is checked out here (the
// workflow runs on the release commit), falling back to the event SHA, or to
// nothing — the report then prints a placeholder — when neither is available.
const head = await $`git rev-parse HEAD`.cwd(repoRoot).quiet().nothrow()
const commit = (head.exitCode === 0 ? head.text().trim() : '') || process.env.GITHUB_SHA || undefined

const report = assessPreflight(entries, {
  repository: process.env.GITHUB_REPOSITORY ?? 'piconic-ai/barefootjs',
  workflow: 'release.yml',
  commit,
})

console.log(report.text)
if (report.blocking) process.exit(1)
