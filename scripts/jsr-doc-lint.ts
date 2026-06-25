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
//   2. Run `deno doc --lint` on those entries per package, then keep only
//      `missing-jsdoc` diagnostics that point at the package's OWN source
//      files. `deno doc --lint` walks the entire documentation graph and lints
//      every symbol reachable from the public API — including third-party /
//      sibling types the package merely references (e.g. `StandardSchemaV1`,
//      the runtime's `Reactive`/`Memo`, a dependency's re-exported `.d.ts`) —
//      and its slow-types rules (`private-type-ref` etc.) are reported at the
//      referencing symbol's own location. JSR's "docs for most symbols" score
//      only counts whether a package's own declared symbols carry JSDoc, so we
//      gate on exactly that and ignore the rest (slow types are already
//      covered by `deno check` and JSR's separate "no slow types" check).
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

import { resolve, dirname, join, sep } from 'node:path'
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

// ── Parse `deno doc --lint` diagnostics, scoped to a package's own src ─
// `deno doc --lint` walks the whole documentation graph and lints every
// symbol reachable from the public API — including third-party and sibling
// types the package merely *references* (e.g. `StandardSchemaV1`, the
// runtime's `Reactive`/`Memo`, or a dependency's re-exported `.d.ts`). JSR's
// "docs for most symbols" score, by contrast, only counts a package's own
// declared symbols, which is all the author can document. So we pair each
// `error[rule]` with the file it points at (`--> path:line:col`), keep only
// the `missing-jsdoc` rule, and within that only diagnostics inside the
// package's own directory.
const ANSI = /\x1b\[[0-9;]*m/g
interface LintResult {
  own: string[] // own undocumented symbols (the author can fix these)
  external: number // missing-jsdoc on referenced third-party / sibling types
  ranOk: boolean // false when deno doc itself failed to run (e.g. bad import)
  raw: string
}
function lint(pkgDir: string, stdout: string, stderr: string, exitCode: number): LintResult {
  const text = (stderr + stdout).replace(ANSI, '')
  const own: string[] = []
  let external = 0
  let total = 0
  let rule: string | null = null
  for (const line of text.split('\n')) {
    const r = line.match(/error\[([a-z-]+)\]/)
    if (r) {
      rule = r[1]
      total++
      continue
    }
    const loc = line.match(/-->\s*(.+?):(\d+):(\d+)\s*$/)
    if (loc && rule) {
      const [, file, ln, col] = loc
      // Only `missing-jsdoc` maps to JSR's "docs for most symbols" score.
      // The other rules — `private-type-ref`, `missing-return-type`,
      // `missing-explicit-type` — are slow-types concerns, already covered by
      // `deno check` and JSR's separate "no slow types" check. Crucially
      // `private-type-ref` is reported at the *referencing* public symbol's own
      // location even when the offending private type is a dependency's (e.g.
      // form's `FieldReturn` referencing the runtime's `Reactive`/`Memo`), so
      // counting it here would fail a package for a dependency's typing.
      if (rule === 'missing-jsdoc') {
        if (file.startsWith(pkgDir + sep) && !file.includes(`${sep}node_modules${sep}`)) {
          own.push(`    missing-jsdoc  ${file.slice(pkgDir.length + 1)}:${ln}:${col}`)
        } else {
          external++
        }
      }
      rule = null
    }
  }
  // exitCode != 0 with zero parsed diagnostics means deno doc never got far
  // enough to lint (module resolution / parse failure) — surface it rather
  // than silently passing.
  return { own, external, ranOk: !(exitCode !== 0 && total === 0), raw: text.trim() }
}

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

    const res = await $`deno doc --lint ${entries}`.cwd(pkgDir).nothrow().quiet()
    const { own, external, ranOk, raw } = lint(
      pkgDir,
      res.stdout.toString(),
      res.stderr.toString(),
      res.exitCode,
    )

    if (!ranOk) {
      console.log(`    could not run deno doc --lint:\n${raw}`)
      ;(enforced ? failed : warned).push(m.name)
      continue
    }

    if (external > 0) {
      console.log(`    ${external} undocumented external referenced type(s) — ignored (not this package's symbols)`)
    }
    if (own.length > 0) {
      console.log(own.join('\n'))
      ;(enforced ? failed : warned).push(m.name)
    } else {
      console.log('    ok — all own exported symbols documented')
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
