/**
 * `@barefootjs/vite` — takes over the client-asset half of `bf build`.
 * Vite/Rollup owns bundling, hashing, chunking, tree-shaking and
 * minification; BarefootJS keeps only the JSX → (template, client JS)
 * compile. See `spike-findings.md` (R1-R3) for the mechanics this plugin
 * is built on, and the design doc for the two-engine architecture:
 *
 *   1. graph pass (`transform`) — Rollup visits `.tsx` modules it can
 *      reach from `build.rollupOptions.input`; this plugin compiles each
 *      one and hands back plain client JS for Rollup to bundle, hash,
 *      tree-shake, chunk, and minify like any other module.
 *   2. eager pass (`writeBundle` for `vite build`, `configureServer` for
 *      `vite dev`) — walks every `.tsx` under `components` directly, NOT
 *      via the module graph. Server-only components (no `'use client'`)
 *      never appear in the graph at all (nothing imports them as a
 *      script, so Rollup never visits them) but still need a template —
 *      this pass is the only place that happens. The build variant runs
 *      in `writeBundle` specifically because the Vite manifest is only
 *      final once Rollup has finished hashing output filenames; the dev
 *      variant runs once the dev server starts listening (the resolved
 *      port is needed to build dev-origin URLs) and again on every
 *      tracked `.tsx` change.
 *
 * Both passes share one `CompileCache` (§4) so a given file's content is
 * compiled at most twice: once canonically (`scriptAssets: []`, cached,
 * shared by both passes — this is the ONLY compile a server-only file, or
 * any file whose real `scriptAssets` also turns out to be `[]`, ever
 * needs) and, only for a `'use client'` file whose real script list
 * (manifest-resolved for build, dev-origin-based for dev) resolves to a
 * non-empty URL list, one further compile with the real `scriptAssets` to
 * bake the correct URL into the template. That second compile is
 * unavoidable within `compileJSX`'s current API shape: a component's
 * template and its client JS are produced by ONE call, but only the
 * template depends on `scriptAssets` (client JS comes from an entirely
 * separate codegen path `adapter.generate()` never touches) — and for the
 * build variant, `scriptAssets` can't be known until Rollup has already
 * hashed the bundle, which requires `transform` to have already run. So
 * `transform` unavoidably compiles once per file before the real URL
 * exists, and the eager pass MUST recompile once more, only for the
 * strict subset of files whose true `scriptAssets` differs from the
 * cached `[]` canonical form, to get a template with the correct URL
 * baked in.
 *
 * Dev's `configureServer` intentionally does NOT diff what changed and
 * recompile only that file's dependents — it re-runs the ENTIRE eager
 * pass on every tracked change. A change to a shared signal module or a
 * child component changes the *parent's* template too, so anything less
 * than a full re-run needs dependency tracking (the complexity this
 * migration is deleting from the legacy CLI's `build-cache.ts`). The
 * content-hash `CompileCache` makes the full pass cheap: every unchanged
 * file's `compileCanonical` call is a cache hit.
 *
 * `options.afterEmit`, if supplied, fires once at the end of EITHER eager
 * pass (`writeBundle`'s `mode: 'build'`, `runDevEagerPass`'s `mode: 'dev'`)
 * with a narrow `AfterEmitContext` (`types`, `projectDir`, `templatesDir`,
 * `outDir`, `mode` — see its docstring in `types.ts`). It exists so an
 * adapter's own `/vite` subpath can combine per-file `types` output into
 * one backend-native file (Go's `components.go`, stripping headers,
 * deduping, injecting shared helpers — real per-language work core has no
 * business doing generically) without a `postBuild`-style rewrite hook on
 * emitted client JS ever being on the table. It fires from BOTH passes,
 * not just the build one, because e.g. Go's `components.go` has to exist
 * for `go run .` to compile even in dev.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import {
  compileJSX,
  formatError,
  type CompileResult,
} from '@barefootjs/jsx'
import type { BarefootViteOptions } from './types.ts'
import { CompileCache } from './compile-cache.ts'
import { BF_CHILD_NOOP_ID, bfChildMarkerName } from './child-marker.ts'
import { buildChildNameIndex, discoverComponents, isComponentSourceFile, type DiscoveredComponent } from './discover.ts'
import { resolveClientJsSpecifier } from './resolve-client-js.ts'
import { buildRelativeImportRewriter, relativeUnderComponentDir, safeRollupEntryName, toPosixRelative } from './paths.ts'
import { loadManifest, resolveScriptAssets } from './manifest.ts'
import { planEmits, writeEmits, type EmitTarget } from './emit.ts'
import { buildManifestEntry, type ManifestEntry } from './component-manifest.ts'
import {
  DEFAULT_DEV_CORS_ORIGIN,
  DEV_ARTIFACT_MARKER_CONTENT,
  DEV_ARTIFACT_MARKER_FILENAME,
  DEV_WATCH_DEBOUNCE_MS,
  devScriptAssets,
  devSentinelPath,
  resolveDevOrigin,
} from './dev-server.ts'
import { createDebouncedSerialRunner } from './debounced-serial-runner.ts'

const PLUGIN_NAME = 'barefoot'

function reportErrors(result: CompileResult, source: string, projectDir: string): void {
  const errors = result.errors.filter(e => e.severity === 'error')
  const warnings = result.errors.filter(e => e.severity === 'warning')
  for (const warning of warnings) {
    console.warn(formatError(warning, source, { projectDir }))
  }
  if (errors.length > 0) {
    const messages = errors.map(e => formatError(e, source, { projectDir })).join('\n\n')
    throw new Error(`[${PLUGIN_NAME}] compile failed:\n\n${messages}`)
  }
}

export function barefoot(options: BarefootViteOptions): Plugin {
  const cache = new CompileCache()

  // What `emitTemplatesFor` last wrote for a given source file, keyed by
  // absolute path. The ONLY consumer is the dev watcher's `'unlink'`
  // handler: when a component file is deleted, this is how it knows which
  // on-disk template/ssrDefaults/types files to remove without having to
  // re-derive the (possibly `templatesPerComponent`, i.e. named after the
  // exported component rather than the source file) output path from a
  // file that no longer exists to read.
  const lastEmitsByAbsPath = new Map<string, EmitTarget[]>()

  // Populated (redundantly but cheaply — a directory walk, no compiling)
  // once in `config` with a best-effort root, so `rollupOptions.input` can
  // be set; then again in `configResolved` with Vite's authoritative
  // `root`, which is what `resolveId` / `transform` / `writeBundle` use.
  let componentDirs: string[] = []
  // `undefined` exactly when `options.templates` was never set — the CSR
  // degenerate case. Every write path below (`writeEmits`, `manifest.json`,
  // the dev-artifact marker, `afterEmit`) is gated on this being defined;
  // `assertNoRealTemplateOutput` is what makes skipping those writes safe
  // rather than a silent drop.
  let templatesDir: string | undefined
  let resolvedConfig: ResolvedConfig | undefined

  // Name → absolute-path index for resolving `@bf-child:<Name>` markers
  // (see `child-marker.ts` and `discover.ts`'s `buildChildNameIndex`).
  // Built once in `configResolved` — before Rollup's graph pass starts
  // calling `resolveId`, which is the only consumer — from a dedicated
  // discovery pass (cheap: a directory walk + a `'use client'` directive
  // peek per file, no compiling).
  let childNameIndex = new Map<string, string>()

  // Re-anchors a relative import written in `absPath` so it still resolves
  // once the template is emitted under `templatesDir`. Pure function of
  // (absPath, componentDirs, templatesDir) — safe to compute for every
  // compile, including the canonical `transform`-time one where it's
  // unused (client JS generation never reads `rewriteRelativeImport`).
  //
  // `outputPathGuess` MUST mirror `planEmits`'s actual on-disk output
  // location — the position of `absPath` under WHICHEVER `componentDirs`
  // entry contains it, joined onto `templatesDir` (`relativeUnderComponentDir`,
  // the same helper `planEmits`/`safeRollupEntryName` use) — not a
  // root-relative guess. The two coincide only when every configured
  // `components` dir IS the Vite root; this repo's real layouts commonly
  // configure MULTIPLE sibling `components` dirs (e.g. `../shared/blog`)
  // that are flattened directly under `templatesDir` with no `shared/blog/`
  // prefix preserved. A root-relative guess computes a phantom nested path
  // (`dist/shared/blog/Foo.tsx`) that diverges from where the file is
  // actually written (`dist/components/Foo.tsx`), corrupting every
  // relative import a same-directory sibling file re-anchors from it — only
  // surfaced by an adapter whose templates carry real `import` syntax
  // (Hono-shaped JS-runtime adapters; Go/Mojo/etc. templates have no
  // imports and never call this at all).
  function rewriterFor(absPath: string): (importPath: string) => string {
    // No `templates` dir configured (the CSR degenerate case) — there is
    // nowhere for a rewritten import to point, but that's harmless: a
    // relative import only reaches emitted template text (never client
    // JS), and `assertNoRealTemplateOutput` refuses loudly the moment any
    // component's template output turns out non-empty. Identity is a safe
    // placeholder for output that can never survive to be read.
    if (templatesDir === undefined) return importPath => importPath
    const outputPathGuess = resolve(templatesDir, relativeUnderComponentDir(absPath, componentDirs))
    return buildRelativeImportRewriter(absPath, outputPathGuess, componentDirs, templatesDir)
  }

  /**
   * Refuses loudly when `options.templates` is omitted but `result` (a
   * specific discovered component's compile) produced a REAL `markedTemplate`
   * — non-empty content that would otherwise be silently dropped by the
   * `templatesDir === undefined` skip below. `ssrDefaults`/`types` output is
   * deliberately NOT checked here: the legacy CLI's own `clientOnly` gate
   * (`packages/cli/src/lib/build.ts`) drops those unconditionally alongside
   * the template even for an adapter whose components carry real signal
   * defaults (a CSR `Counter` DOES produce non-empty `ssrDefaults` — proven
   * by inspection — precisely because that computation reads IR metadata,
   * not the adapter's `generate()` output), so treating them as
   * loudness-worthy here would make `templates` impossible to omit for the
   * one adapter (`CSRAdapter`) this option exists to accommodate.
   */
  function assertNoRealTemplateOutput(result: CompileResult, absPath: string): void {
    const real = result.files.find(f => f.type === 'markedTemplate' && f.content.trim() !== '')
    if (!real) return
    throw new Error(
      `[${PLUGIN_NAME}] adapter "${options.adapter.name}" produced a real template for ` +
      `"${absPath}", but no \`templates\` option is configured on barefoot() — that output ` +
      `would be silently dropped. Set \`templates: '<dir>'\`, or use an adapter whose ` +
      `generate() output is always empty (e.g. CSRAdapter) if this project truly emits no ` +
      `templates.`,
    )
  }

  function compileCanonical(absPath: string, content: string): CompileResult {
    return cache.getOrCompile(absPath, content, () =>
      compileJSX(content, absPath, {
        adapter: options.adapter,
        sourceMaps: true,
        // The canonical, cacheable compile always uses an empty
        // scriptAssets ("no scripts") — the one input every discovered
        // file (server-only or client) shares regardless of its eventual
        // manifest entry. Everything except the template's script
        // registration is identical no matter what `scriptAssets` is, so
        // this single compile is reused as-is for every server-only
        // component and any client component that turns out to need no
        // scripts. See this module's docstring.
        scriptAssets: [],
        rewriteRelativeImport: rewriterFor(absPath),
        // The eager pass ALWAYS writes every discovered component's
        // template into the SAME `templates` dir for the app to register
        // together at request/startup time (that's the whole point of
        // walking `components` directly instead of following the module
        // graph) — the exact guarantee `siblingTemplatesRegistered`
        // exists to assert. Without it, a DSL-template adapter (Go,
        // ERB, Blade, Jinja, ...) refuses to compile ANY component that
        // uses a sibling-imported child inside a `.map()` loop (BF103),
        // even though the shape works fine once the app's own template
        // registration (e.g. Go's `filepath.WalkDir` + `ParseFiles` over
        // every `.tmpl`) puts every template on one instance — which this
        // plugin's design already requires. The legacy CLI makes the same
        // assumption unconditionally (`packages/cli/src/lib/
        // build.ts`'s `siblingTemplatesRegistered: true`); this mirrors
        // it. Harmless for the client-JS graph pass that also calls this
        // function — the option only ever reaches `adapter.generate()`'s
        // TEMPLATE codegen, never client JS.
        siblingTemplatesRegistered: true,
      }),
    )
  }

  function isUnderComponentDir(absPath: string): boolean {
    return componentDirs.some(dir => absPath === dir || absPath.startsWith(`${dir}/`))
  }

  /**
   * Shared eager-pass body: compile + emit a template for every discovered
   * component, resolving each `'use client'` component's real
   * `scriptAssets` via the caller-supplied `resolveScriptAssetsFor` (the
   * manifest for `writeBundle`, dev-origin URLs for `configureServer`).
   * See this module's docstring for why both callers need the FULL
   * discovered set every time, not just what changed.
   *
   * Returns every `types`-typed output this pass produced, keyed by
   * source absolute path — the raw material `afterEmit` receives (see
   * `AfterEmitContext`). Collected here (not read back off disk) since
   * `planEmits`/`writeEmits` already have the compiled `CompileResult` in
   * hand; no adapter-specific knowledge is needed to harvest it.
   *
   * When `options.templates` is omitted (`templatesDir === undefined`),
   * this still compiles every discovered component — the graph pass
   * (`transform`) needs the same canonical compile anyway, and
   * `assertNoRealTemplateOutput` needs a real `CompileResult` to check —
   * but writes nothing to disk on any component's behalf and returns an
   * empty `types` map. See `types.ts`'s docstring on `templates`.
   */
  async function emitTemplatesFor(
    discovered: DiscoveredComponent[],
    projectDir: string,
    resolveScriptAssetsFor: (component: DiscoveredComponent) => string[],
  ): Promise<Map<string, string>> {
    const types = new Map<string, string>()
    // Combined `manifest.json` row per source file — see
    // `component-manifest.ts`'s header for why this is written alongside
    // (not instead of) the per-component `.ssr-defaults.json` files
    // `writeEmits` already produces. Stays empty (and unwritten) when
    // `templatesDir` is undefined.
    const manifestEntries: Record<string, ManifestEntry> = {}
    for (const component of discovered) {
      const content = await readFile(component.absPath, 'utf8')
      const canonical = compileCanonical(component.absPath, content)
      reportErrors(canonical, content, projectDir)

      let result = canonical
      if (component.isClient) {
        const scriptAssets = resolveScriptAssetsFor(component)
        if (scriptAssets.length > 0) {
          result = compileJSX(content, component.absPath, {
            adapter: options.adapter,
            sourceMaps: true,
            scriptAssets,
            rewriteRelativeImport: rewriterFor(component.absPath),
            // See `compileCanonical`'s docstring on this same field.
            siblingTemplatesRegistered: true,
          })
          reportErrors(result, content, projectDir)
        }
      }

      if (templatesDir === undefined) {
        assertNoRealTemplateOutput(result, component.absPath)
        continue
      }

      const targets = planEmits(result, component.absPath, componentDirs, options.adapter)
      lastEmitsByAbsPath.set(component.absPath, targets)
      await writeEmits(templatesDir, targets)

      for (const file of result.files) {
        if (file.type === 'types') types.set(component.absPath, file.content)
      }

      const manifestRow = buildManifestEntry(result, component.absPath, componentDirs, options.adapter)
      if (manifestRow) manifestEntries[manifestRow.manifestKey] = manifestRow.entry
    }

    if (templatesDir === undefined) return types

    // Written unconditionally every pass (matching `writeEmits`'s own
    // no-diffing convention for this eager pass, and the legacy CLI's own
    // always-write-unless-clientOnly behavior) — `discovered` is always the
    // FULL current set (see this module's docstring on why this plugin
    // never does a partial/diffed re-run), so this naturally drops a
    // deleted component's row without any separate cleanup step. `mkdir`
    // first: an empty `discovered` set means `writeEmits` never ran (no
    // targets to create `templatesDir` for), so it may not exist yet.
    await mkdir(templatesDir, { recursive: true })
    await writeFile(resolve(templatesDir, 'manifest.json'), JSON.stringify(manifestEntries, null, 2))

    return types
  }

  /**
   * Remove whatever `emitTemplatesFor` last wrote for each of `absPaths`
   * (a deleted component's template, `ssrDefaults`, and `.types` fragment)
   * and forget it — both from the emit-tracking map and the compile
   * cache, so a file later recreated at the same path never reuses a
   * stale cached result. Best-effort: `rm(..., { force: true })` so a
   * file already gone (or never successfully written) isn't an error.
   */
  async function removeEmitsFor(absPaths: Iterable<string>): Promise<void> {
    for (const absPath of absPaths) {
      const targets = lastEmitsByAbsPath.get(absPath)
      lastEmitsByAbsPath.delete(absPath)
      cache.delete(absPath)
      // `lastEmitsByAbsPath` is only ever populated inside `emitTemplatesFor`
      // when `templatesDir` is defined (see its `continue` for the CSR
      // degenerate case), so `targets` is never non-empty here without
      // `templatesDir` also being defined — this check is for the type
      // checker, not a real runtime possibility.
      if (!targets || templatesDir === undefined) continue
      for (const target of targets) {
        await rm(resolve(templatesDir, target.relPath), { force: true })
      }
    }
  }

  /**
   * Dev variant of the eager pass: discovers every component fresh (a
   * changed file's new content must be picked up — `CompileCache` keys on
   * content hash, so a stale in-memory listing is harmless, but a stale
   * listing that MISSES a newly added file would not be) and bakes
   * `devOrigin`-based `scriptAssets` instead of manifest-resolved ones.
   * Also (re)writes the dev-artifact marker — see `dev-server.ts` — and
   * refreshes `childNameIndex` (a component added or removed mid-session
   * must be reflected in `@bf-child:` marker resolution the same way it's
   * reflected in everything else this pass recomputes from scratch).
   */
  async function runDevEagerPass(devOrigin: string): Promise<void> {
    const config = resolvedConfig
    if (!config) return

    const discovered = await discoverComponents(componentDirs, absPath => readFile(absPath, 'utf8'))
    childNameIndex = buildChildNameIndex(discovered)
    const types = await emitTemplatesFor(discovered, config.root, component =>
      devScriptAssets(config, devOrigin, component.absPath),
    )

    // Both the marker and `afterEmit` exist to annotate/post-process
    // `templatesDir` — neither has anything to do when there isn't one
    // (the CSR degenerate case).
    if (templatesDir === undefined) return

    await writeFile(resolve(templatesDir, DEV_ARTIFACT_MARKER_FILENAME), DEV_ARTIFACT_MARKER_CONTENT)

    // Legacy cross-language dev-reload sentinel (see `devSentinelPath`'s
    // docstring) — written unconditionally on every pass, initial pass
    // included, matching the legacy CLI's `watch()` writing it both on
    // the initial build and every rebuild. A fresh timestamp is enough:
    // consumers only compare it against their own last-seen value.
    const sentinelPath = devSentinelPath(templatesDir)
    await mkdir(resolve(sentinelPath, '..'), { recursive: true })
    await writeFile(sentinelPath, String(Date.now()))

    if (options.afterEmit) {
      await options.afterEmit({
        types,
        projectDir: config.root,
        templatesDir,
        outDir: resolve(config.root, config.build.outDir),
        mode: 'dev',
      })
    }
  }

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',

    async config(userConfig) {
      // Best-effort root for the eager discovery this hook needs to set
      // `rollupOptions.input` — Vite hasn't resolved the real root yet at
      // this point in its own lifecycle (that only exists once
      // `configResolved` fires), so this assumes the common case of
      // running Vite from the project root with no `root` override. If
      // that assumption doesn't hold for a given project, `configResolved`
      // still recomputes everything `resolveId`/`transform`/`writeBundle`
      // actually use against Vite's real resolved root — only the
      // convenience `rollupOptions.input` keys this hook picks could be
      // off, not correctness.
      const guessedRoot = userConfig.root ? resolve(process.cwd(), userConfig.root) : process.cwd()
      const dirs = options.components.map(d => resolve(guessedRoot, d))
      const found = await discoverComponents(dirs, absPath => readFile(absPath, 'utf8'))

      const input: Record<string, string> = {}
      for (const c of found) {
        if (!c.isClient) continue
        // The object KEY only names the output chunk (Rollup's `[name]`) —
        // it must be safe even for a `components` dir outside `root` (see
        // `safeRollupEntryName`). It is NOT the manifest lookup key
        // (`writeBundle` computes that separately via `toPosixRelative`
        // against Vite's real resolved root, matching Vite's own
        // manifest keying, which this name has no effect on).
        input[safeRollupEntryName(guessedRoot, c.absPath, dirs)] = c.absPath
      }

      // Cross-origin dev default: the page comes from the backend, its
      // module scripts from Vite — two different origins. Vite 6+ defaults
      // `cors` to same-origin-only, which would reject those cross-origin
      // module requests outright. Fill in a localhost-only default ONLY
      // when the user hasn't set `server.cors` themselves — this stays a
      // 3-option plugin (`adapter` / `components` / `templates`); no 4th
      // `devOrigin`-style option is added for this. Done here in `config`
      // (not `configureServer`) so it lands before Vite installs its own
      // CORS middleware, and so it's plain, synchronously-testable data
      // instead of a hook-timing dependency on Vite's internal
      // configureServer/middleware install order.
      //
      // Checked against `undefined` specifically, NOT falsiness: a user
      // who writes `server.cors = false` to explicitly DISABLE CORS means
      // exactly that, and `!false` is `true` — a truthiness check would
      // silently override their choice with this default, the opposite of
      // "only fill in when unset".
      const serverDefaults: Record<string, unknown> = {}
      if (userConfig.server?.cors === undefined) {
        serverDefaults.cors = { origin: DEFAULT_DEV_CORS_ORIGIN }
      }

      return {
        appType: 'custom',
        build: {
          manifest: true,
          rollupOptions: { input },
        },
        server: serverDefaults,
      }
    },

    async configResolved(config) {
      resolvedConfig = config
      componentDirs = options.components.map(d => resolve(config.root, d))
      templatesDir = options.templates !== undefined ? resolve(config.root, options.templates) : undefined
      const discovered = await discoverComponents(componentDirs, absPath => readFile(absPath, 'utf8'))
      childNameIndex = buildChildNameIndex(discovered)
    },

    resolveId(source, importer) {
      // See `child-marker.ts`: a `@bf-child:` marker isn't a real module.
      // Resolve it to the named child's REAL `.tsx` file when discovery
      // found one — Rollup then treats it as an ordinary entry-to-entry
      // import (the child is independently a Rollup entry too, being
      // `'use client'`), which is what makes the browser fetch and
      // execute the child's script as a side effect of loading the
      // parent's. Falls back to a shared empty virtual module (elided by
      // Rollup's tree-shaking, `moduleSideEffects: false`) for a name this
      // simple map doesn't cover, rather than failing the build outright.
      const childName = bfChildMarkerName(source)
      if (childName !== null) {
        const childAbsPath = childNameIndex.get(childName)
        if (childAbsPath) return childAbsPath
        return { id: BF_CHILD_NOOP_ID, moduleSideEffects: false }
      }
      return resolveClientJsSpecifier(source, importer)
    },

    load(id) {
      if (id === BF_CHILD_NOOP_ID) return ''
      return null
    },

    transform(code, id) {
      if (!id.endsWith('.tsx')) return null
      if (!isUnderComponentDir(id)) return null

      const result = compileCanonical(id, code)
      reportErrors(result, code, resolvedConfig?.root ?? process.cwd())

      const clientJs = result.files.find(f => f.type === 'clientJs')
      if (!clientJs) return null

      const map = result.files.find(f => f.type === 'sourceMap' && f.path === `${clientJs.path}.map`)
      return {
        code: clientJs.content,
        map: map ? JSON.parse(map.content) : null,
      }
    },

    async writeBundle() {
      const config = resolvedConfig
      if (!config) return

      // Authoritative discovery — Vite's real root, not `config`'s guess.
      const discovered: DiscoveredComponent[] = await discoverComponents(
        componentDirs,
        absPath => readFile(absPath, 'utf8'),
      )

      const outDir = resolve(config.root, config.build.outDir)
      const manifest = await loadManifest(outDir, config.build.manifest)

      const types = await emitTemplatesFor(discovered, config.root, component => {
        const manifestKey = toPosixRelative(config.root, component.absPath)
        return resolveScriptAssets(manifest, manifestKey, config.base)
      })

      // No `templates` dir configured (the CSR degenerate case) — nothing
      // was written for `emitTemplatesFor` to have staled, and `afterEmit`
      // exists to post-process `templatesDir`, which doesn't exist here.
      if (templatesDir === undefined) return

      // A prior `vite dev` run may have left the dev-artifact marker (and
      // dev-origin URLs) behind — this pass just overwrote every template
      // with production URLs, so the marker is now stale. Best-effort:
      // there may never have been one.
      await rm(resolve(templatesDir, DEV_ARTIFACT_MARKER_FILENAME), { force: true })
      // Same for the dev-reload sentinel: a production build is not a dev
      // rebuild, so a stale `.dev/build-id` left over from an earlier
      // `vite dev` session should not trick a still-running Go/Perl dev
      // server into firing a reload for output that didn't come from it.
      await rm(devSentinelPath(templatesDir), { force: true })

      if (options.afterEmit) {
        await options.afterEmit({ types, projectDir: config.root, templatesDir, outDir, mode: 'build' })
      }
    },

    configureServer(server: ViteDevServer) {
      // Mandatory: Vite's dev watcher only reliably covers the module
      // graph plus whatever's under its own project `root`. Server-only
      // components (no `'use client'`) never enter the module graph at
      // all (nothing imports them as a script), and in this monorepo's
      // real layouts `components` dirs are commonly siblings of — not
      // descendants of — the Vite project root (an app's `vite.config.ts`
      // root is the backend app dir; components live in a shared `ui/`
      // directory next to it). Without this explicit `add`, editing such
      // a file is silently invisible to the dev server: no watcher event,
      // no re-emit, no reload. See `e2e-vite-dev.test.ts`'s server-only /
      // out-of-root regression coverage.
      for (const dir of componentDirs) {
        server.watcher.add(dir)
      }

      let devOrigin: string | undefined
      // Deleted files queued for cleanup by the `'unlink'` handler,
      // drained by the runner's own task the next time it actually runs —
      // NOT deleted synchronously in the handler, so an unlink that lands
      // while a pass is already in flight for other reasons is still
      // batched into the SAME follow-up run as everything else instead of
      // racing it.
      const pendingUnlinks = new Set<string>()

      // One serialized, debounced entry point for every dev-watcher event
      // this plugin reacts to (`change` / `add` / `unlink`). See
      // `debounced-serial-runner.ts`: a burst of events collapses into one
      // pass, an event arriving mid-pass is queued as exactly one
      // follow-up (never dropped, never overlapped), and no distinction
      // needs to be drawn between which files changed — the pass itself
      // re-discovers everything from disk (see this module's docstring on
      // why a diff-based re-run is the wrong shape here).
      const devPassRunner = createDebouncedSerialRunner(
        async () => {
          if (!devOrigin) return // initial pass (below) will cover current disk state once it runs
          await removeEmitsFor(pendingUnlinks)
          pendingUnlinks.clear()
          await runDevEagerPass(devOrigin)
          server.ws.send({ type: 'full-reload' })
        },
        DEV_WATCH_DEBOUNCE_MS,
        err => server.config.logger.error(String(err)),
      )

      async function runInitialPass(): Promise<void> {
        devOrigin = resolveDevOrigin(server)
        await runDevEagerPass(devOrigin)
      }

      if (server.httpServer) {
        // The resolved port isn't known until the server actually starts
        // listening — Vite auto-increments past an in-use configured port
        // unless `strictPort` is set, so anything read earlier could be
        // wrong. `configureServer` itself always runs before `listen()`.
        server.httpServer.once('listening', () => {
          runInitialPass().catch(err => server.config.logger.error(String(err)))
        })
      } else {
        // Middleware mode: no `httpServer`, so no `'listening'` event ever
        // fires. Run immediately with whatever origin is already
        // configured (or the bare `localhost:<configured port>` fallback
        // inside `resolveDevOrigin`).
        runInitialPass().catch(err => server.config.logger.error(String(err)))
      }

      // `'change'`: an existing tracked file's content changed.
      server.watcher.on('change', (file: string) => {
        if (!isComponentSourceFile(file) || !isUnderComponentDir(file)) return
        devPassRunner.trigger()
      })

      // `'add'`: a brand-new component file. Without this, a file created
      // mid-session gets no template at all until some OTHER file happens
      // to change and drags it along on the next full pass — creating a
      // component is completely ordinary, not an edge case.
      server.watcher.on('add', (file: string) => {
        if (!isComponentSourceFile(file) || !isUnderComponentDir(file)) return
        devPassRunner.trigger()
      })

      // `'unlink'`: a tracked file was deleted. Its template would
      // otherwise linger on disk forever — queue it for `removeEmitsFor`
      // inside the same debounced/serialized pass rather than deleting
      // synchronously here (see `pendingUnlinks` above).
      server.watcher.on('unlink', (file: string) => {
        if (!isComponentSourceFile(file) || !isUnderComponentDir(file)) return
        pendingUnlinks.add(file)
        devPassRunner.trigger()
      })
    },
  }
}
