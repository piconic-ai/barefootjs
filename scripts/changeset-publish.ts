#!/usr/bin/env bun
//
// Publish script for the release workflow (changesets/action).
//
// Uses `bun publish` instead of `npm publish` so that workspace:*
// protocol references are resolved to concrete version numbers.
// npm publish does NOT resolve workspace:*, which causes consumers to
// see EUNSUPPORTEDPROTOCOL errors on install.
//
// For each publishable package whose local version differs from the
// npm registry, runs `bun publish --access public` and creates a git
// tag. changesets/action reads the tags to create GitHub Releases.
//
// Requires:
//   - `bun run build` to have completed
//   - NODE_AUTH_TOKEN env var (set by actions/setup-node with registry-url)
//
// Usage:
//   bun scripts/changeset-publish.mjs

import { resolve } from 'node:path'
import { $ } from 'bun'

const repoRoot = resolve(import.meta.dir, '..')

// Publish order: dependencies before dependents.
const PUBLISHABLE = [
  'packages/shared',
  'packages/streaming',
  'packages/jsx',
  'packages/client',
  'packages/test',
  'packages/form',
  'packages/chart',
  'packages/xyflow',
  'packages/adapter-hono',
  'packages/adapter-go-template',
  'packages/adapter-mojolicious',
  'packages/cli',
  'packages/create-barefootjs',
]

async function npmView(name) {
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
const errors = []

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

  const pub = await $`bun publish --access public`
    .cwd(resolve(repoRoot, pkgDir))
    .nothrow()
  if (pub.exitCode !== 0) {
    errors.push(`${pkg.name}@${pkg.version}`)
    continue
  }

  const tag = `${pkg.name}@${pkg.version}`
  const t = await $`git tag ${tag}`.cwd(repoRoot).quiet().nothrow()
  console.log(`  tagged  ${tag}${t.exitCode !== 0 ? ' (already exists)' : ''}`)

  published++
}

console.log(`\n  Done: ${published} published, ${skipped} skipped`)

if (errors.length > 0) {
  console.error(`\n  ${errors.length} error(s):`)
  for (const e of errors) console.error(`    - ${e}`)
  process.exit(1)
}
