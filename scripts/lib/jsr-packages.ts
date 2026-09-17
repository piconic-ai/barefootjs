// The JSR side of a release, shared by the scripts that need the same
// answer: WHICH `@barefootjs/*` packages are mirrored to JSR, and whether
// JSR currently knows a package / a version.
//
//   scripts/jsr-publish.ts        derives a deno.json per eligible package
//                                 and `deno publish`es it
//   scripts/release-preflight.ts  checks every eligible package EXISTS on
//                                 JSR before npm publishes anything (a
//                                 package has to be created on jsr.io by
//                                 hand before CI can publish to it)
//
// The eligibility rule is subtle enough (scoped, not private, not a `bin`
// package, not in Changesets' ignore list, AND carrying at least one
// resolvable `src` export) that restating it anywhere else is how
// `@barefootjs/perl` / `@barefootjs/php` / `@barefootjs/cli` once got
// reported as "missing from JSR" when they are simply not published there.
// It lives here, once.

import { join } from 'node:path'
import { existsSync } from 'node:fs'
import {
  type PkgJson,
  type WorkspacePackage,
  changesetIgnoreList,
  workspacePackages,
} from './workspace-packages'

export type { PkgJson }
export type Candidate = WorkspacePackage

export interface JsrPackages {
  /** Eligible packages (see `discoverJsrPackages`), in sorted directory order. */
  candidates: Candidate[]
  /** name → version for EVERY workspace package (eligible or not), for `jsr:` ranges. */
  versions: Map<string, string>
  /** name → resolved `src` exports, for every candidate. */
  jsrExports: Map<string, Record<string, string>>
  /** The names that actually land on JSR: candidates with ≥1 resolvable export. */
  jsrPublishable: Set<string>
}

// Export keys that are dev-tooling helpers, not consumer-runtime API:
//   ./build       — the package's barefoot.config.ts build-config factory.
//                   Consumers run their build under Bun/Node (the `bf`
//                   CLI ships as an npm executable), so a Deno-shaped
//                   build entry has no audience, and its node:fs/Buffer
//                   typings trip Deno's stricter check (e.g. TS2367 on
//                   `Buffer !== string` comparisons that tsgo lets pass).
//   ./test-render — IR test-render harness; only ever defined via the
//                   `bun:` export condition and uses Bun.* globals
//                   directly. Genuinely Bun-only.
// Both are intentionally absent from the JSR surface — npm consumers
// still get them unchanged.
export const JSR_SKIP_EXPORT_KEYS = new Set(['./build', './test-render'])

// ── Resolve a single export entry to a publishable `src` TS file ──────
export function resolveExportTarget(dir: string, entry: unknown): string | null {
  // Gather candidate targets across conditions, most source-like first.
  // `bun:` is deliberately omitted — an export whose only resolution is
  // the `bun:` condition is Bun-runtime-specific by its package.json
  // author's own declaration and has no business on JSR. (Mixed entries
  // like `{ bun: …, import: … }` still resolve via `import`/`default`.)
  const targets: string[] = []
  if (typeof entry === 'string') {
    targets.push(entry)
  } else if (entry && typeof entry === 'object') {
    const e = entry as Record<string, string>
    for (const cond of [e.import, e.default, e.types]) {
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
// dropping entries with no source sibling or that are listed as dev-tooling
// keys (see `JSR_SKIP_EXPORT_KEYS`).
export function resolveExports(dir: string, pkg: PkgJson): Record<string, string> {
  const exportsIn = pkg.exports ?? { '.': './src/index.ts' }
  const exportsOut: Record<string, string> = {}
  for (const [key, entry] of Object.entries(exportsIn)) {
    if (JSR_SKIP_EXPORT_KEYS.has(key)) continue
    const target = resolveExportTarget(dir, entry)
    if (target) exportsOut[key] = target
  }
  return exportsOut
}

// ── Discover eligible packages ────────────────────────────────────────
// JSR is the home for the *libraries* consumers `import`. The
// *executables* — the `bf` CLI and the `create-barefootjs` scaffolder —
// stay npm-only and Deno users invoke them via the `npm:` specifier
// (`deno x npm:@barefootjs/cli …` / `deno x npm:create-barefootjs`), so
// they're filtered out here. Eligibility:
//   - scoped `@barefootjs/*` (JSR requires a scope; `create-barefootjs`
//     is unscoped anyway),
//   - not `private`,
//   - not a `bin` package (executable, → npm),
//   - not in `.changeset/config.json`'s ignore list.
//
// A `@barefootjs/*` package is JSR-publishable only if it is eligible AND
// carries at least one resolvable `src` export. A scoped sibling that
// publishes to a *different* registry — e.g. the Perl runtime
// `@barefootjs/perl` (`lib/*.pm`, a CPAN dist with no TS exports) — is NOT in
// `jsrPublishable`, so it must never be emitted as a `jsr:` import of a
// dependent: that would point the manifest at a package that never exists on
// JSR. The TS sources don't import such siblings anyway — the relationship is
// a cross-language / release-coordination one expressed elsewhere (the
// dependent's `cpanfile`, and changesets' `fixed` group), not a code import.
export function discoverJsrPackages(repoRoot: string): JsrPackages {
  const ignore = changesetIgnoreList(repoRoot)
  const candidates: Candidate[] = []
  const versions = new Map<string, string>()

  for (const entry of workspacePackages(repoRoot)) {
    const { pkg } = entry
    versions.set(pkg.name, pkg.version)
    if (pkg.private) continue
    if (!pkg.name.startsWith('@barefootjs/')) continue
    if (pkg.bin) continue // executables (bf CLI) ship to npm, run via `npm:`
    if (ignore.includes(pkg.name)) continue
    candidates.push(entry)
  }

  const jsrExports = new Map<string, Record<string, string>>()
  for (const { dir, pkg } of candidates) jsrExports.set(pkg.name, resolveExports(dir, pkg))
  const jsrPublishable = new Set(
    [...jsrExports].filter(([, e]) => Object.keys(e).length > 0).map(([name]) => name),
  )

  return { candidates, versions, jsrExports, jsrPublishable }
}

// ── What JSR currently knows ──────────────────────────────────────────
// jsr.io/<pkg>/meta.json is served through a CDN whose edge caches are
// eventually consistent — the same version can read as present on one fetch
// and absent on the next (observed: a version skipped as "already on JSR" in
// one run, then reported missing in the next). Since we use this as the source
// of truth for both skip and post-publish verification, bypass the cache: a
// unique query string forces a fresh origin read, plus no-store on our side.
async function fetchMeta(name: string): Promise<Response> {
  return fetch(`https://jsr.io/${name}/meta.json?_=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
  })
}

/** Has this exact version already been published to JSR? */
export async function jsrHasVersion(name: string, version: string): Promise<boolean> {
  try {
    const res = await fetchMeta(name)
    if (!res.ok) return false
    const meta = (await res.json()) as { versions?: Record<string, unknown> }
    return Boolean(meta.versions && version in meta.versions)
  } catch {
    return false // network hiccup → let `deno publish` be the judge
  }
}

/**
 * Does the package exist on JSR at all? A 404 on meta.json is JSR's answer
 * for a package nobody has created yet — the state `deno publish` refuses
 * with "Following packages don't exist, follow the links and create them".
 * Anything other than 200/404 is "could not tell", kept apart from
 * "missing" on purpose (see `RegistryPresence`).
 */
export async function jsrPackagePresence(
  name: string,
): Promise<{ status: 'present' } | { status: 'missing' } | { status: 'unknown'; reason: string }> {
  try {
    const res = await fetchMeta(name)
    if (res.status === 200) return { status: 'present' }
    if (res.status === 404) return { status: 'missing' }
    return { status: 'unknown', reason: `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'unknown', reason: err instanceof Error ? err.message : String(err) }
  }
}
