#!/usr/bin/env bun
//
// Measure the JSR "has docs for most symbols" score factor locally / in CI,
// without depending on jsr.io.
//
// JSR's package score rewards documenting a package's public API (its
// "has docs for most symbols" check wants ≥80% of exported symbols to carry
// JSDoc). `deno doc --lint` emits the same signal — it flags every exported
// symbol that is missing a JSDoc comment (and missing return / explicit
// types) — so running it against the surface JSR publishes lets us catch a
// doc-coverage regression at PR time instead of after publish on jsr.io.
//
// What it does:
//   1. Generate each JSR-publishable package's `deno.json` from its
//      package.json by invoking `scripts/jsr-publish.ts --dry-run --keep`
//      (the same single source of truth release + ci-jsr-check use), so the
//      `exports` linted here are exactly the entries JSR documents.
//   2. Run `deno doc --lint` on those entries per package.
//   3. Tier the result (mirrors ci-jsr-check's deno-check idiom):
//        ENFORCE — fully-documented packages whose coverage must not
//                  regress; a lint failure exits non-zero.
//        others  — linted for visibility only (warning), so adopting the
//                  gate is incremental: document a package's exports, then
//                  add it to ENFORCE below.
//   4. Remove any `deno.json` it generated (manifests already present before
//      the run — e.g. left by an earlier CI step — are left untouched).
//
// Flags:
//   --only a,b   Restrict to these package names (comma-separated).
//   --strict     Treat every package as enforced (fail on any undocumented
//                export), ignoring the ENFORCE tiering.
//
// Requires the Deno CLI on PATH (`deno doc`).

import { resolve, dirname, join } from 'node:path'
import { existsSync, readFileSync, rmSync, readdirSync } from 'node:fs'
import { $ } from 'bun'

const repoRoot = resolve(import.meta.dir, '..')
const argv = process.argv.slice(2)
const strict = argv.includes('--strict')
const onlyArg = argv[argv.indexOf('--only') + 1]
const only =
  argv.includes('--only') && onlyArg
    ? new Set(onlyArg.split(',').map(s => s.trim()))
    : null

// Packages whose public surface is fully documented and must stay that way.
// Add a package here once `deno doc --lint` is clean for it. Kept in lock-step
// with the ENFORCE set in .github/workflows/ci-jsr-check.yml.
const ENFORCE = new Set<string>(['@barefootjs/form'])

// ── Preflight: the Deno CLI must be on PATH ───────────────────────────
if ((await $`deno --version`.nothrow().quiet()).exitCode !== 0) {
  console.error(
    '  deno not found on PATH. Install Deno (https://deno.com) to run the\n' +
      '  JSR doc-coverage lint locally — CI provides it via setup-deno.',
  )
  process.exit(1)
}

// ── Generate manifests (single source of truth: jsr-publish.ts) ───────
// Record which deno.json files already exist so we only clean up the ones
// this run creates (a prior CI step may have generated them with --keep).
const packagesDir = resolve(repoRoot, 'packages')
const preExisting = new Set(
  readdirSync(packagesDir)
    .map(d => join(packagesDir, d, 'deno.json'))
    .filter(existsSync),
)

await $`bun ${join('scripts', 'jsr-publish.ts')} --dry-run --keep`
  .cwd(repoRoot)
  .quiet()

const manifests = readdirSync(packagesDir)
  .map(d => join(packagesDir, d, 'deno.json'))
  .filter(existsSync)

// ── Lint each package's exported entries ──────────────────────────────
const failed: string[] = []
const warned: string[] = []

try {
  for (const manifest of manifests) {
    const pkgDir = dirname(manifest)
    const m = JSON.parse(readFileSync(manifest, 'utf8')) as {
      name: string
      exports?: string | Record<string, string>
    }
    if (only && !only.has(m.name)) continue

    const entries =
      typeof m.exports === 'string'
        ? [m.exports]
        : Object.values(m.exports ?? {})
    if (entries.length === 0) continue

    const enforced = strict || ENFORCE.has(m.name)
    console.log(
      `\n  deno doc --lint  ${m.name} (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})${enforced ? '  [enforced]' : ''}`,
    )

    const res = await $`deno doc --lint ${entries}`.cwd(pkgDir).nothrow()
    if (res.exitCode !== 0) {
      if (enforced) failed.push(m.name)
      else warned.push(m.name)
    }
  }
} finally {
  for (const f of manifests) {
    if (!preExisting.has(f)) rmSync(f, { force: true })
  }
}

if (warned.length > 0) {
  console.log(
    `\n  Undocumented (not yet enforced): ${warned.join(', ')}\n  → document their exports, then add them to ENFORCE.`,
  )
}

if (failed.length > 0) {
  console.error(
    `\n  deno doc --lint failed for enforced package(s): ${failed.join(', ')}`,
  )
  process.exit(1)
}

console.log('\n  deno doc --lint passed for all enforced JSR-publishable packages.')
