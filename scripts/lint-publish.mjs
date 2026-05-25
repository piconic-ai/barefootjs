#!/usr/bin/env node
//
// Validates that publishable packages don't leak the workspace: protocol
// in their packed manifest. Uses `bun pm pack` (which calls prepack hooks
// and resolves workspace:* to concrete versions) then inspects the result.
//
// Requires `bun run build` to have completed first (prepack hooks need
// dist/ artefacts).
//
// Usage:
//   bun run lint:publish            # validate all publishable packages
//   bun run lint:publish --verbose  # show per-package results
//
// Also wired into CI via `.github/workflows/ci-lint-publish.yml` and
// as a pre-publish gate in `.github/workflows/release.yml`.

import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const verbose = process.argv.includes('--verbose')

// Keep in sync with smoke-publish.mjs PUBLISHABLE.
const PUBLISHABLE = [
  'packages/shared',
  'packages/jsx',
  'packages/client',
  'packages/streaming',
  'packages/test',
  'packages/adapter-hono',
  'packages/adapter-go-template',
  'packages/adapter-mojolicious',
  'packages/form',
  'packages/chart',
  'packages/xyflow',
  'packages/cli',
  'packages/create-barefootjs',
]

const DEP_SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies']
const tmpDir = mkdtempSync(join(tmpdir(), 'bf-lint-publish-'))
const failures = []

try {
  for (const pkgDir of PUBLISHABLE) {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, pkgDir, 'package.json'), 'utf-8'),
    )

    let tarball
    try {
      const out = execSync(`bun pm pack --quiet --destination=${tmpDir}`, {
        cwd: resolve(repoRoot, pkgDir),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      tarball = out.trim().split('\n').pop()
    } catch (err) {
      failures.push({ name: pkg.name, issues: [`bun pm pack failed: ${err.stderr || err.message}`] })
      continue
    }

    execSync(`tar xzf "${tarball}" package/package.json`, { cwd: tmpDir })
    const packed = JSON.parse(
      readFileSync(join(tmpDir, 'package', 'package.json'), 'utf-8'),
    )
    rmSync(join(tmpDir, 'package'), { recursive: true })

    const issues = []
    for (const section of DEP_SECTIONS) {
      for (const [dep, ver] of Object.entries(packed[section] || {})) {
        if (String(ver).startsWith('workspace:')) {
          issues.push(`${section}["${dep}"] = "${ver}"`)
        }
      }
    }

    if (issues.length > 0) {
      failures.push({ name: pkg.name, issues })
    } else if (verbose) {
      console.log(`  ✓ ${pkg.name}`)
    }
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error('lint-publish: FAIL — workspace: protocol found in packed manifests\n')
  for (const { name, issues } of failures) {
    console.error(`  ${name}:`)
    for (const issue of issues) {
      console.error(`    - ${issue}`)
    }
  }
  console.error('\n  The workspace: protocol is not supported by npm consumers.')
  console.error('  Ensure prepack resolves it, or use `bun publish` which resolves automatically.')
  process.exit(1)
}

console.log(`lint-publish: PASS — ${PUBLISHABLE.length} packages verified, no workspace: in packed deps`)
