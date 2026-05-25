#!/usr/bin/env node
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
//   node scripts/changeset-publish.mjs

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

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

function npmView(name) {
  try {
    const result = execSync(`npm view "${name}" version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return result.trim()
  } catch (err) {
    if (err.stderr && err.stderr.includes('E404')) {
      return null
    }
    console.warn(`  warn  npm view "${name}" failed: ${(err.stderr || err.message).trim()}`)
    return null
  }
}

let published = 0
let skipped = 0
const errors = []

for (const pkgDir of PUBLISHABLE) {
  const pkgPath = resolve(repoRoot, pkgDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

  if (pkg.private) continue

  const registryVersion = npmView(pkg.name)
  if (registryVersion === pkg.version) {
    console.log(`  skip  ${pkg.name}@${pkg.version} (already on npm)`)
    skipped++
    continue
  }

  const label = registryVersion
    ? `${registryVersion} → ${pkg.version}`
    : 'new'
  console.log(`\n  publish  ${pkg.name}@${pkg.version} (${label})`)

  try {
    execSync('bun publish --access public', {
      cwd: resolve(repoRoot, pkgDir),
      stdio: 'inherit',
    })
  } catch (err) {
    errors.push(`${pkg.name}@${pkg.version}: ${err.message}`)
    continue
  }

  const tag = `${pkg.name}@${pkg.version}`
  try {
    execSync(`git tag "${tag}"`, { cwd: repoRoot, stdio: 'pipe' })
    console.log(`  tagged  ${tag}`)
  } catch {
    console.log(`  tagged  ${tag} (already exists)`)
  }

  published++
}

console.log(`\n  Done: ${published} published, ${skipped} skipped`)

if (errors.length > 0) {
  console.error(`\n  ${errors.length} error(s):`)
  for (const e of errors) console.error(`    - ${e}`)
  process.exit(1)
}
