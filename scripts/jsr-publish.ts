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
//        - imports: workspace `@barefootjs/*` deps → `jsr:` specifiers
//          at the dependency's current version; other deps → `npm:`
//          specifiers; the package's own export subpaths → local `src`
//          (covers internal self-imports like `@barefootjs/client/reactive`).
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
  // Pick the most source-like condition: bun/import/default, then types.
  let target: string | undefined
  if (typeof entry === 'string') {
    target = entry
  } else if (entry && typeof entry === 'object') {
    const e = entry as Record<string, string>
    target = e.bun ?? e.import ?? e.default ?? e.types
  }
  if (!target) return null

  const tryPaths: string[] = []
  // Built outputs map back to their TS source under src/.
  if (target.includes('/dist/')) {
    tryPaths.push(target.replace('/dist/', '/src/').replace(/\.d\.ts$/, '.ts').replace(/\.js$/, '.ts'))
  }
  // A `.d.ts` source has no runtime module JSR can publish — but a `.ts`
  // sibling (some `types` point straight at `.d.ts` shims) might exist.
  if (target.endsWith('.d.ts')) {
    tryPaths.push(target.replace(/\.d\.ts$/, '.ts'))
  } else {
    tryPaths.push(target)
  }

  for (const p of tryPaths) {
    if (!p.endsWith('.d.ts') && existsSync(join(dir, p))) return p
  }
  return null
}

function buildManifest(dir: string, pkg: PkgJson) {
  // exports ----------------------------------------------------------------
  const exportsIn = pkg.exports ?? { '.': './src/index.ts' }
  const exportsOut: Record<string, string> = {}
  for (const [key, entry] of Object.entries(exportsIn)) {
    const target = resolveExportTarget(dir, entry)
    if (target) exportsOut[key] = target
  }

  // imports ----------------------------------------------------------------
  const importsOut: Record<string, string> = {}
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) }
  for (const [name, range] of Object.entries(deps)) {
    if (name.startsWith('@barefootjs/')) {
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
    const pub = await $`deno publish --allow-slow-types --allow-dirty`
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
