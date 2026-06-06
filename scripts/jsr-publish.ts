#!/usr/bin/env bun
//
// Publish the scoped BarefootJS libraries to JSR (https://jsr.io/@barefootjs).
//
// JSR config is GENERATED from each package's package.json rather than
// hand-maintained per package — add a new publishable `@barefootjs/*`
// package and it is picked up automatically, with no edits here or in
// the workflow. This mirrors `changeset-publish.ts` (the npm side) so
// both registries stay in lock-step off the same source of truth.
//
// What it does for every eligible package (scoped `@barefootjs/*`, not
// `private`, not in `.changeset/config.json`'s ignore list):
//   1. Derive a JSR manifest from package.json:
//        - exports: package.json `exports`, remapped from built `dist/*`
//          (and the npm `import`/`bun`/`types` conditions) to the `src/*`
//          TypeScript sources JSR publishes. Entries that only resolve to
//          a `.d.ts` (e.g. the jsx-runtime type shims) or to a
//          bundler-only artifact with no `src` sibling are dropped —
//          JSR is source-first and can't publish those.
//        - version: taken live from package.json (the Changesets bump),
//          so the manifest never drifts.
//        - imports: workspace `@barefootjs/*` deps that are themselves
//          published to JSR → `jsr:` specifiers at the dependency's current
//          version (a scoped sibling published elsewhere, e.g. the Perl
//          runtime `@barefootjs/perl`, is dropped — never a dangling `jsr:`);
//          other deps → `npm:` specifiers; the package's own export subpaths
//          → local `src` (covers self-imports like `@barefootjs/client/reactive`).
//   2. Skip it if that exact version is already live on JSR (idempotent —
//      a Changesets release only bumps a subset, the rest no-op).
//   3. `deno publish` the package (unless `--dry-run`).
//
// Flags:
//   --dry-run            Generate + print manifests; do not query JSR or publish.
//   --only a,b           Restrict to these package names (comma-separated).
//   --keep               Leave generated jsr.json files in place (debugging).
//
// Requires (non-dry-run): the Deno CLI, the `@barefootjs` JSR scope and
// each package created on jsr.io, and `id-token: write` for OIDC auth.

import { resolve, join } from 'node:path'
import { existsSync, readdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { $ } from 'bun'

const repoRoot = resolve(import.meta.dir, '..')
const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const keep = argv.includes('--keep')
const onlyArg = argv[argv.indexOf('--only') + 1]
const only = argv.includes('--only') && onlyArg ? new Set(onlyArg.split(',').map(s => s.trim())) : null

interface PkgJson {
  name: string
  version: string
  private?: boolean
  exports?: Record<string, unknown>
  bin?: unknown
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const ignore: string[] = JSON.parse(
  readFileSync(resolve(repoRoot, '.changeset/config.json'), 'utf8'),
).ignore ?? []

// ── Discover eligible packages ────────────────────────────────────────
// JSR is the home for the *libraries* consumers `import`. The
// *executables* — the `bf` CLI and the `create-barefootjs` scaffolder —
// stay npm-only and Deno users invoke them via the `npm:` specifier
// (`deno run -A npm:bf …` / `deno run -A npm:create-barefootjs`), so
// they're filtered out here. Eligibility:
//   - scoped `@barefootjs/*` (JSR requires a scope; `create-barefootjs`
//     is unscoped anyway),
//   - not `private`,
//   - not a `bin` package (executable, → npm),
//   - not in `.changeset/config.json`'s ignore list.
const pkgDirs = readdirSync(resolve(repoRoot, 'packages'))
  .map(d => resolve(repoRoot, 'packages', d))
  .filter(d => existsSync(join(d, 'package.json')))

interface Candidate {
  dir: string
  pkg: PkgJson
}

const candidates: Candidate[] = []
const versions = new Map<string, string>() // name → version (for jsr: ranges)

for (const dir of pkgDirs) {
  const pkg: PkgJson = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  versions.set(pkg.name, pkg.version)
  if (pkg.private) continue
  if (!pkg.name.startsWith('@barefootjs/')) continue
  if (pkg.bin) continue // executables (bf CLI) ship to npm, run via `npm:`
  if (ignore.includes(pkg.name)) continue
  candidates.push({ dir, pkg })
}

// ── Resolve a single export entry to a publishable `src` TS file ──────
function resolveExportTarget(dir: string, entry: unknown): string | null {
  // Gather candidate targets across conditions, most source-like first.
  const targets: string[] = []
  if (typeof entry === 'string') {
    targets.push(entry)
  } else if (entry && typeof entry === 'object') {
    const e = entry as Record<string, string>
    for (const cond of [e.bun, e.import, e.default, e.types]) {
      if (cond) targets.push(cond)
    }
  }

  // Map each candidate to the TS source JSR would publish and return the
  // first that actually exists under src/. Built outputs (`dist/*.js`,
  // `dist/*.d.ts`) map back to their `src/*.ts` sibling. A condition may
  // point at a path with no source sibling — e.g. client's
  // `./runtime/standalone` → `dist/runtime/standalone.js`, a bundler-only
  // variant of `src/runtime/index.ts` that its `types` condition still
  // resolves to — so we fall through to the next condition rather than
  // dropping the export (or, worse, emitting an unpublished `dist/*`
  // path). Candidates that only resolve to a `.d.ts` shim (e.g. the
  // jsx-runtime type-only exports) have no `src` sibling and drop out.
  for (const target of targets) {
    const src = target
      .replace('/dist/', '/src/')
      .replace(/\.d\.ts$/, '.ts')
      .replace(/\.js$/, '.ts')
    if (src.endsWith('.d.ts')) continue
    if (existsSync(join(dir, src))) return src
  }
  return null
}

// Resolve a package's `exports` map to the `src` TS files JSR would publish,
// dropping entries with no source sibling.
function resolveExports(dir: string, pkg: PkgJson): Record<string, string> {
  const exportsIn = pkg.exports ?? { '.': './src/index.ts' }
  const exportsOut: Record<string, string> = {}
  for (const [key, entry] of Object.entries(exportsIn)) {
    const target = resolveExportTarget(dir, entry)
    if (target) exportsOut[key] = target
  }
  return exportsOut
}

// ── Which scoped packages actually land on JSR ────────────────────────
// A `@barefootjs/*` package is JSR-publishable only if it is eligible AND
// carries at least one resolvable `src` export. A scoped sibling that
// publishes to a *different* registry — e.g. the Perl runtime
// `@barefootjs/perl` (`lib/*.pm`, a CPAN dist with no TS exports) — is NOT in
// this set, so it must never be emitted as a `jsr:` import of a dependent:
// that would point the manifest at a package that never exists on JSR. The
// TS sources don't import such siblings anyway — the relationship is a
// cross-language / release-coordination one expressed elsewhere (the
// dependent's `cpanfile`, and changesets' `fixed` group), not a code import.
const jsrExports = new Map<string, Record<string, string>>()
for (const { dir, pkg } of candidates) jsrExports.set(pkg.name, resolveExports(dir, pkg))
const jsrPublishable = new Set(
  [...jsrExports].filter(([, e]) => Object.keys(e).length > 0).map(([name]) => name),
)

function buildManifest(dir: string, pkg: PkgJson) {
  // exports ----------------------------------------------------------------
  const exportsOut = jsrExports.get(pkg.name) ?? resolveExports(dir, pkg)

  // imports ----------------------------------------------------------------
  const importsOut: Record<string, string> = {}
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) }
  for (const [name, range] of Object.entries(deps)) {
    if (name.startsWith('@barefootjs/')) {
      // Only scoped siblings that are themselves JSR-published get a `jsr:`
      // specifier; a non-JSR sibling (the Perl runtime) is dropped.
      if (!jsrPublishable.has(name)) continue
      const v = versions.get(name)
      importsOut[name] = v ? `jsr:${name}@^${v}` : `jsr:${name}`
    } else {
      // workspace:* / catalog: have no meaning off-monorepo; fall back to
      // a permissive range so JSR resolves the published npm package.
      const clean = /^[~^]?\d/.test(range) ? range : '*'
      importsOut[name] = `npm:${name}@${clean}`
    }
  }
  // Self-imports: source files reference the package's own subpaths
  // (e.g. `@barefootjs/client/reactive`) — map them to local src.
  for (const [key, target] of Object.entries(exportsOut)) {
    if (key === '.') continue
    importsOut[`${pkg.name}${key.slice(1)}`] = target
  }

  const manifest: Record<string, unknown> = {
    name: pkg.name,
    version: pkg.version,
    exports: exportsOut,
  }
  if (Object.keys(importsOut).length > 0) manifest.imports = importsOut
  manifest.publish = { include: ['src', 'README.md', 'LICENSE', 'jsr.json'] }
  return manifest
}

// ── Topological order (dependencies before dependents) ───────────────
function topoSort(cands: Candidate[]): Candidate[] {
  const byName = new Map(cands.map(c => [c.pkg.name, c]))
  const sorted: Candidate[] = []
  const seen = new Set<string>()
  const visit = (c: Candidate) => {
    if (seen.has(c.pkg.name)) return
    seen.add(c.pkg.name)
    const deps = { ...(c.pkg.dependencies ?? {}), ...(c.pkg.peerDependencies ?? {}) }
    for (const dep of Object.keys(deps)) {
      const depCand = byName.get(dep)
      if (depCand) visit(depCand)
    }
    sorted.push(c)
  }
  for (const c of cands) visit(c)
  return sorted
}

// ── Has this exact version already been published to JSR? ─────────────
async function jsrHasVersion(name: string, version: string): Promise<boolean> {
  try {
    const res = await fetch(`https://jsr.io/${name}/meta.json`)
    if (!res.ok) return false
    const meta = (await res.json()) as { versions?: Record<string, unknown> }
    return Boolean(meta.versions && version in meta.versions)
  } catch {
    return false // network hiccup → let `deno publish` be the judge
  }
}

// ── Run ───────────────────────────────────────────────────────────────
const selected = topoSort(candidates).filter(c => !only || only.has(c.pkg.name))
const generated: string[] = []
let published = 0
let skipped = 0
const errors: string[] = []

try {
  for (const { dir, pkg } of selected) {
    const manifest = buildManifest(dir, pkg)
    const exportCount = Object.keys((manifest.exports as object) ?? {}).length
    if (exportCount === 0) {
      console.warn(`  warn  ${pkg.name}: no publishable src exports — skipping`)
      skipped++
      continue
    }

    const manifestPath = join(dir, 'jsr.json')
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    generated.push(manifestPath)

    if (dryRun) {
      console.log(`\n  [dry-run] ${pkg.name}@${pkg.version} (${exportCount} export(s))`)
      console.log(JSON.stringify(manifest, null, 2).split('\n').map(l => `    ${l}`).join('\n'))
      continue
    }

    if (await jsrHasVersion(pkg.name, pkg.version)) {
      console.log(`  skip  ${pkg.name}@${pkg.version} (already on JSR)`)
      skipped++
      continue
    }

    console.log(`\n  publish  ${pkg.name}@${pkg.version} → JSR`)
    // --no-check: skip Deno's publish-time `tsc` pass. These are
    //   DOM-targeted libraries (`HTMLElement`, `DragEvent`, `SubmitEvent`,
    //   `PointerEvent`, …) and Deno's default lib set has the bare web
    //   globals but NOT the full DOM lib, so the check fails with spurious
    //   TS2304 "Cannot find name" errors that don't reflect a real problem
    //   for consumers. The sources are already fully type-checked in CI
    //   under `lib: ["ES2022","DOM","DOM.Iterable"]`, so re-checking here
    //   adds no coverage — it only breaks the release.
    // --allow-slow-types: JSR still extracts the public API for docs/.d.ts
    //   and warns on slow types; this permits publishing through that warning.
    const pub = await $`deno publish --no-check --allow-slow-types --allow-dirty`
      .cwd(dir)
      .nothrow()
    if (pub.exitCode !== 0) {
      errors.push(`${pkg.name}@${pkg.version}`)
      continue
    }
    published++
  }
} finally {
  if (!keep) for (const f of generated) rmSync(f, { force: true })
}

if (dryRun) {
  console.log(`\n  Dry run: ${selected.length} package(s) would be considered`)
} else {
  console.log(`\n  Done: ${published} published, ${skipped} skipped`)
}

if (errors.length > 0) {
  console.error(`\n  ${errors.length} error(s):`)
  for (const e of errors) console.error(`    - ${e}`)
  process.exit(1)
}
