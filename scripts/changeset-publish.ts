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
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { $ } from 'bun'

const repoRoot = resolve(import.meta.dir, '..')
const tmpDir = mkdtempSync(`${tmpdir()}/bf-publish-`)

// Publish order: dependencies before dependents.
const PUBLISHABLE = [
  'packages/shared',
  'packages/streaming',
  'packages/jsx',
  'packages/client',
  'packages/router',
  'packages/test',
  'packages/form',
  'packages/chart',
  'packages/xyflow',
  'packages/adapter-hono',
  'packages/adapter-go-template',
  'packages/adapter-perl',
  'packages/adapter-xslate',
  'packages/adapter-mojolicious',
  'packages/adapter-erb',
  'packages/adapter-jinja',
  'packages/adapter-php',
  'packages/adapter-twig',
  'packages/adapter-blade',
  'packages/adapter-rust',
  'packages/cli',
  'packages/create-barefootjs',
]

async function npmView(name: string): Promise<string | null> {
  const result = await $`npm view ${name} version`.quiet().nothrow()
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString()
    if (stderr.includes('E404')) return null
    console.warn(`  warn  npm view "${name}" failed: ${stderr.trim()}`)
    return null
  }
  return result.text().trim()
}

let published = 0
let skipped = 0
const errors: string[] = []

try {
  for (const pkgDir of PUBLISHABLE) {
    const pkg = await Bun.file(resolve(repoRoot, pkgDir, 'package.json')).json()

    if (pkg.private) continue

    const registryVersion = await npmView(pkg.name)
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

    // Create a local git tag so changesets/action can detect the publish.
    // The action parses stdout for "New tag: <name>@<version>" lines to set
    // its `published` output and to create GitHub Releases.
    const tag = `${pkg.name}@${pkg.version}`
    const t = await $`git tag ${tag}`.cwd(repoRoot).quiet().nothrow()
    const tagAlreadyExists = t.exitCode !== 0 && t.stderr.toString().includes('already exists')
    if (t.exitCode !== 0 && !tagAlreadyExists) {
      console.error(`  git tag failed: ${t.stderr.toString().trim()}`)
      errors.push(`${tag} (tag)`)
      continue
    }
    console.log(`New tag: ${tag}`)

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
