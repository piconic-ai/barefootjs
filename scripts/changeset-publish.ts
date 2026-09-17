#!/usr/bin/env bun
//
// Publish script for the release workflow (changesets/action).
//
// Two-step publish for each package:
//   1. `bun pm pack` — resolves workspace:* to concrete versions
//   2. `npm publish <tarball> --provenance` — publishes with OIDC auth + provenance
//
// This hybrid approach gives us:
//   - workspace:* resolution (bun)
//   - Trusted Publishing / OIDC auth (npm) — no long-lived NPM_TOKEN needed
//   - Provenance attestation (npm --provenance)
//
// Requires:
//   - `bun run build` to have completed
//   - Trusted Publishers configured on npmjs.com for each package
//   - Workflow permission: id-token: write
//
// Usage:
//   bun scripts/changeset-publish.ts

import { resolve } from 'node:path'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { $ } from 'bun'
import { npmPublishablePackages, npmRegistryVersion } from './lib/npm-packages'

const repoRoot = resolve(import.meta.dir, '..')
const tmpDir = mkdtempSync(`${tmpdir()}/bf-publish-`)

// Unset when the script is run by hand outside changesets/action.
const outputFile = process.env.CHANGESETS_OUTPUT
// Not left to the first append: the action names this file but never creates
// it, so a run that publishes nothing would leave it missing and the action
// warns that the script failed to report -- the same warning it gives when
// reporting is genuinely broken. An empty file says "nothing published" in a
// way that stays distinct from that.
if (outputFile) writeFileSync(outputFile, '')

let published = 0
let skipped = 0
const errors: string[] = []

try {
  for (const { rel: pkgDir, pkg } of npmPublishablePackages(repoRoot)) {
    // The publish list and this lookup are shared with the release preflight
    // (scripts/release-preflight.ts), which has already refused the run if a
    // package does not exist on npm at all -- so `missing` here is only
    // reachable when the script is run by hand. A lookup that could not
    // tell is warned and treated as "not this version": the publish itself
    // is the judge.
    const lookup = await npmRegistryVersion(pkg.name)
    if (lookup.status === 'unknown') {
      console.warn(`  warn  npm view "${pkg.name}" failed: ${lookup.reason}`)
    }
    const registryVersion = lookup.status === 'present' ? lookup.version : null
    if (registryVersion === pkg.version) {
      console.log(`  skip  ${pkg.name}@${pkg.version} (already on npm)`)
      skipped++
      continue
    }

    const label = registryVersion
      ? `${registryVersion} → ${pkg.version}`
      : 'new'
    console.log(`\n  publish  ${pkg.name}@${pkg.version} (${label})`)

    // Step 1: pack with bun (resolves workspace:*)
    const pack = await $`bun pm pack --quiet --destination ${tmpDir}`
      .cwd(resolve(repoRoot, pkgDir))
      .quiet()
      .nothrow()
    if (pack.exitCode !== 0) {
      console.error(`  bun pm pack failed: ${pack.stderr.toString().trim()}`)
      errors.push(`${pkg.name}@${pkg.version} (pack)`)
      continue
    }
    const tarball = resolve(pack.text().trim().split('\n').pop()!)

    // Step 2: publish tarball with npm (OIDC auth + provenance)
    const pub = await $`npm publish ${tarball} --provenance --access public --tag latest`.nothrow()
    if (pub.exitCode !== 0) {
      errors.push(`${pkg.name}@${pkg.version} (publish)`)
      continue
    }

    const tag = `${pkg.name}@${pkg.version}`
    const t = await $`git tag ${tag}`.cwd(repoRoot).quiet().nothrow()
    const tagAlreadyExists = t.exitCode !== 0 && t.stderr.toString().includes('already exists')
    if (t.exitCode !== 0 && !tagAlreadyExists) {
      console.error(`  git tag failed: ${t.stderr.toString().trim()}`)
      errors.push(`${tag} (tag)`)
      continue
    }
    // Not stdout: changesets/action v2 reads only this file, and a publish it
    // cannot see is one it never tags, releases, or gates downstream jobs on.
    if (outputFile) {
      appendFileSync(
        outputFile,
        `${JSON.stringify({ type: 'git-tag', tag, packageName: pkg.name })}\n`,
      )
    }
    console.log(`  tagged  ${tag}`)

    published++
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true })
}

console.log(`\n  Done: ${published} published, ${skipped} skipped`)

if (errors.length > 0) {
  console.error(`\n  ${errors.length} error(s):`)
  for (const e of errors) console.error(`    - ${e}`)
  process.exit(1)
}
