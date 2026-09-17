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
// Which packages are eligible, and how their `exports` resolve to the
// `src` files JSR publishes, is decided in `scripts/lib/jsr-packages.ts`
// (shared with the release preflight — one rule, one place).
//
// What it does for every eligible package:
//   1. Derive a Deno manifest (`deno.json`) from package.json:
//        - compilerOptions.lib: `["deno.window","dom","dom.iterable",
//          "dom.asynciterable"]` (Deno's documented "DOM + runtime" recipe).
//          These are DOM-targeted libraries (`HTMLElement`, `DragEvent`,
//          `SubmitEvent`, …) and Deno's default publish-time lib has the bare
//          web globals but NOT the full DOM, so without this `deno publish`'s
//          type-check fails with TS2304 "Cannot find name" errors. `dom` alone
//          would drop the runtime globals the sources need (`process` in
//          jsx/hono/go-template); a `/// <reference lib="dom">` would instead
//          collide with Deno's own `Event`/`EventTarget` defs. The `deno.window`
//          base + `dom` layer avoids both. compilerOptions only lives in
//          `deno.json`, not the JSR-subset `jsr.json` — hence the manifest is
//          emitted as `deno.json`.
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
//   3. `deno publish` the package (unless `--dry-run`), retrying failures
//      in additional passes while earlier successes unblock them — see the
//      fixpoint loop's comment for why package.json edges can't be trusted
//      to predict what a package's real module graph needs.
//
// Flags:
//   --dry-run            Generate + print manifests; do not query JSR or publish.
//   --only a,b           Restrict to these package names (comma-separated).
//   --keep               Leave generated deno.json files in place (debugging).
//
// Requires (non-dry-run): the Deno CLI, the `@barefootjs` JSR scope and
// each package created on jsr.io, and `id-token: write` for OIDC auth.

import { resolve, join } from 'node:path'
import { existsSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { $ } from 'bun'
import ts from 'typescript'
import { type PkgJson, discoverJsrPackages, jsrHasVersion } from './lib/jsr-packages'
import { topoSort } from './lib/workspace-packages'

const repoRoot = resolve(import.meta.dir, '..')
const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const keep = argv.includes('--keep')
const onlyArg = argv[argv.indexOf('--only') + 1]
const only = argv.includes('--only') && onlyArg ? new Set(onlyArg.split(',').map(s => s.trim())) : null

const { candidates, versions, jsrExports, jsrPublishable } = discoverJsrPackages(repoRoot)

function buildManifest(dir: string, pkg: PkgJson) {
  // exports ----------------------------------------------------------------
  const exportsOut = jsrExports.get(pkg.name) ?? {}

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
  // Type-check under Deno's documented "DOM + runtime" lib set so `deno
  // publish` resolves the DOM types these libraries export. `deno.window` is
  // the combinable Deno base — it keeps the runtime globals the published
  // sources rely on (notably `process`, used in jsx/hono/go-template) while
  // letting `dom` layer the browser types on top without the duplicate-
  // identifier clash a bare `dom`-only or `/// <reference lib>` would cause.
  const compilerOptions: Record<string, unknown> = {
    lib: ['deno.window', 'dom', 'dom.iterable', 'dom.asynciterable'],
  }
  // JSX-bearing packages (adapter-hono's `.tsx` sources) author against the
  // package tsconfig's `jsx`/`jsxImportSource`, with matching per-file
  // `// @jsxImportSource` pragmas that must stay line comments for esbuild
  // (see adapter-hono/src/scripts.tsx). Deno ≤2.8.2 honored those pragmas
  // during `deno publish` type-checking; 2.8.3 ignores them and falls back
  // to the classic React transform — TS2874/TS7026 on every tag. Mirror the
  // tsconfig's JSX settings into the manifest, which every Deno version
  // respects regardless of pragma handling.
  const tsconfigPath = join(dir, 'tsconfig.json')
  if (existsSync(tsconfigPath)) {
    // tsconfig is JSONC — parse with the TS helper, not JSON.parse.
    const { config, error } = ts.parseConfigFileTextToJson(
      tsconfigPath,
      readFileSync(tsconfigPath, 'utf8'),
    )
    if (error) {
      // Don't fail the whole mirror over it, but don't drop the JSX settings
      // silently either — without them a .tsx-bearing package resurfaces as
      // opaque TS2874/TS7026 publish errors.
      console.warn(
        `  warn  ${pkg.name}: tsconfig.json parse failed (${ts.flattenDiagnosticMessageText(error.messageText, ' ')}) — JSX settings not mirrored into deno.json`,
      )
    }
    const tsOpts = (config?.compilerOptions ?? {}) as Record<string, unknown>
    if (tsOpts.jsx) {
      compilerOptions.jsx = tsOpts.jsx
      if (tsOpts.jsxImportSource) compilerOptions.jsxImportSource = tsOpts.jsxImportSource
    }
  }
  manifest.compilerOptions = compilerOptions
  manifest.publish = { include: ['src', 'README.md', 'LICENSE', 'deno.json'] }
  return manifest
}

// ── Run ───────────────────────────────────────────────────────────────
const selected = topoSort(candidates).filter(c => !only || only.has(c.pkg.name))
const generated: string[] = []
let published = 0
let skipped = 0
const errors: string[] = []
const pending: string[] = []

// `deno publish` uploads in seconds, then polls JSR until the server-side
// publishing task (module-graph + slow-types doc generation) finishes — but on
// these slow-typed packages that task can run far past any CI cap while the
// version itself still goes live (confirmed on jsr.io). So we don't wait on
// Deno's never-returning poll: cap it at the upload window, then treat JSR as
// the source of truth and poll jsrHasVersion until the version appears.
// Background: jsr-io/jsr#642, fedify-dev/fedify#468.
const DENO_PUBLISH_TIMEOUT_S = 240 // generous: type-check + upload take seconds
const VERIFY_TIMEOUT_MS = 6 * 60_000
const VERIFY_INTERVAL_MS = 15_000

interface WorkItem {
  dir: string
  pkg: PkgJson
}

/** Outcome of one publish attempt. `failed` carries deno's exit code so
 * the run summary can name it — deno's own diagnostics already reach the
 * workflow log (the `$` below is deliberately not `.quiet()`), but the
 * summary is what a reader scans first. */
type PublishOutcome =
  | { status: 'published' }
  | { status: 'pend' }
  | { status: 'failed'; exitCode: number | null }

/** One `deno publish` attempt + JSR-is-source-of-truth verification. */
async function publishOne(dir: string, pkg: PkgJson): Promise<PublishOutcome> {
  console.log(`\n  publish  ${pkg.name}@${pkg.version} → JSR`)
  // Type-checking stays ON — the generated `deno.json` carries
  // `compilerOptions.lib` (Deno's DOM + runtime set) so the DOM types these
  // libraries export resolve cleanly. --allow-slow-types lets JSR extract the
  // public API for docs/.d.ts through its (benign) slow-types warning;
  // --allow-dirty permits the in-tree generated manifest.
  // `timeout` cuts Deno's post-upload poll short (see DENO_PUBLISH_TIMEOUT_S
  // note above); the verify loop below is what actually confirms success.
  const pub = await $`timeout --kill-after=10s ${DENO_PUBLISH_TIMEOUT_S} deno publish --allow-slow-types --allow-dirty`
    .cwd(dir)
    .nothrow()
  // 124 (TERM) / 137 (KILL) mean our timeout fired while Deno was still
  // polling — expected, not a failure. Any other non-zero is a genuine
  // publish error (type error, auth, unresolvable dep, …).
  const cutShort = pub.exitCode === 124 || pub.exitCode === 137
  if (pub.exitCode !== 0 && !cutShort) {
    // Deno's own diagnostics (the actionable part — "Could not find version
    // of X", a type error, an auth failure) are already in the log above:
    // the `$` call streams them. Name the package and code here so a reader
    // can tie that output to this attempt, and so the summary can repeat it.
    console.error(`  fail  ${pkg.name}@${pkg.version} (deno exit ${pub.exitCode}) — see deno output above`)
    return { status: 'failed', exitCode: pub.exitCode }
  }

  // JSR is the source of truth: poll until the version is live, regardless of
  // whether Deno returned cleanly or we cut its hung poll short.
  let live = await jsrHasVersion(pkg.name, pkg.version)
  const deadline = Date.now() + VERIFY_TIMEOUT_MS
  while (!live && Date.now() < deadline) {
    await Bun.sleep(VERIFY_INTERVAL_MS)
    live = await jsrHasVersion(pkg.name, pkg.version)
  }
  if (live) {
    console.log(`  ok    ${pkg.name}@${pkg.version} live on JSR${cutShort ? ' (deno poll cut short)' : ''}`)
    return { status: 'published' }
  }
  if (cutShort) {
    // We cut Deno's poll short and JSR is still finishing server-side — the
    // expected pending case. A later pass (or re-dispatch) re-checks
    // jsrHasVersion and skips it once live.
    console.log(`  pend  ${pkg.name}@${pkg.version} submitted; not live within ${VERIFY_TIMEOUT_MS / 60_000}m`)
    return { status: 'pend' }
  }
  // Deno exited 0 — it observed the server-side publishing task complete —
  // so the version IS published; meta.json is just propagating through the
  // CDN slower than our verify window (observed past 6m on real runs, e.g.
  // client@0.13.0, which this path used to misreport as an error). Count it
  // published; dependents are safe to follow since the registry itself has
  // the version.
  console.log(`  ok    ${pkg.name}@${pkg.version} published (per deno); meta.json still propagating`)
  return { status: 'published' }
}

try {
  // Phase 1: write every manifest, collect the publish work list.
  const work: WorkItem[] = []
  for (const { dir, pkg } of selected) {
    const manifest = buildManifest(dir, pkg)
    const exportCount = Object.keys((manifest.exports as object) ?? {}).length
    if (exportCount === 0) {
      console.warn(`  warn  ${pkg.name}: no publishable src exports — skipping`)
      skipped++
      continue
    }

    const manifestPath = join(dir, 'deno.json')
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    generated.push(manifestPath)

    if (dryRun) {
      console.log(`\n  [dry-run] ${pkg.name}@${pkg.version} (${exportCount} export(s))`)
      console.log(JSON.stringify(manifest, null, 2).split('\n').map(l => `    ${l}`).join('\n'))
      continue
    }
    work.push({ dir, pkg })
  }

  // Phase 2: publish to a fixpoint. package.json peer edges form cycles
  // (client ↔ jsx are mutual peers) that the packages' REAL module graphs
  // don't — no jsx source file imports @barefootjs/client — so a
  // dependency-edge defer (the previous design) deadlocked the whole mirror
  // the moment one cycle member failed: client's publish-time resolution
  // needs jsx@<version> live, jsx sat deferred behind client, and every
  // re-dispatch failed identically (0.31.0, run 31109650323). `deno publish`
  // is the only judge of what a package's graph actually needs, and a failed
  // attempt costs seconds — so just attempt everything in topo order and
  // retry the failures while passes make progress: client fails pass 1,
  // jsx (whose graph never touches client) publishes, pass 2 picks client
  // up against the now-live jsx, and the rest cascade.
  let remaining = work
  for (let pass = 1; remaining.length > 0; pass++) {
    if (pass > 1) console.log(`\n  pass ${pass}: retrying ${remaining.map(w => w.pkg.name).join(', ')}`)
    const failed: { item: WorkItem; outcome: Exclude<PublishOutcome, { status: 'published' }> }[] = []
    let progressed = false
    for (const item of remaining) {
      const { dir, pkg } = item
      if (await jsrHasVersion(pkg.name, pkg.version)) {
        console.log(`  skip  ${pkg.name}@${pkg.version} (already on JSR)`)
        skipped++
        progressed = true
        continue
      }
      const outcome = await publishOne(dir, pkg)
      if (outcome.status === 'published') {
        published++
        progressed = true
      } else {
        failed.push({ item, outcome })
      }
    }
    if (!progressed || failed.length === 0) {
      // Fixpoint: nothing new went live this pass (or nothing left) —
      // classify the leftovers and stop. `pend` stays exit-0 (submitted,
      // server-side processing; a re-dispatch continues), genuine deno
      // failures stay errors.
      for (const f of failed) {
        if (f.outcome.status === 'pend') pending.push(`${f.item.pkg.name}@${f.item.pkg.version}`)
        else errors.push(`${f.item.pkg.name}@${f.item.pkg.version} (deno exit ${f.outcome.exitCode})`)
      }
      break
    }
    remaining = failed.map(f => f.item)
  }
} finally {
  if (!keep) for (const f of generated) rmSync(f, { force: true })
}

if (dryRun) {
  console.log(`\n  Dry run: ${selected.length} package(s) would be considered`)
} else {
  console.log(`\n  Done: ${published} published, ${skipped} skipped${pending.length ? `, ${pending.length} pending` : ''}`)
}

if (pending.length > 0) {
  // Not a failure — these are submitted and processing server-side, or
  // deferred behind one that is. Surface clearly and exit 0 so a re-dispatch
  // can continue.
  console.warn(`\n  ${pending.length} pending (re-dispatch to continue):`)
  for (const p of pending) console.warn(`    - ${p}`)
}

if (errors.length > 0) {
  console.error(`\n  ${errors.length} error(s):`)
  for (const e of errors) console.error(`    - ${e}`)
  process.exit(1)
}
