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
 */
import { readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import {
  compileJSX,
  formatError,
  type CompileResult,
} from '@barefootjs/jsx'
import type { BarefootViteOptions } from './types.ts'
import { CompileCache } from './compile-cache.ts'
import { discoverComponents, isComponentSourceFile, type DiscoveredComponent } from './discover.ts'
import { resolveClientJsSpecifier } from './resolve-client-js.ts'
import { buildRelativeImportRewriter, toPosixRelative } from './paths.ts'
import { loadManifest, resolveScriptAssets } from './manifest.ts'
import { planEmits, writeEmits, type EmitTarget } from './emit.ts'
import {
  DEFAULT_DEV_CORS_ORIGIN,
  DEV_ARTIFACT_MARKER_CONTENT,
  DEV_ARTIFACT_MARKER_FILENAME,
  DEV_WATCH_DEBOUNCE_MS,
  devScriptAssets,
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
  let templatesDir = ''
  let resolvedConfig: ResolvedConfig | undefined

  // Re-anchors a relative import written in `absPath` so it still resolves
  // once the template is emitted under `templatesDir`. Pure function of
  // (absPath, componentDirs, templatesDir) — safe to compute for every
  // compile, including the canonical `transform`-time one where it's
  // unused (client JS generation never reads `rewriteRelativeImport`).
  function rewriterFor(absPath: string): (importPath: string) => string {
    const outputPathGuess = resolve(templatesDir, toPosixRelative(resolvedConfig!.root, absPath))
    return buildRelativeImportRewriter(absPath, outputPathGuess, componentDirs, templatesDir)
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
   */
  async function emitTemplatesFor(
    discovered: DiscoveredComponent[],
    projectDir: string,
    resolveScriptAssetsFor: (component: DiscoveredComponent) => string[],
  ): Promise<void> {
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
          })
          reportErrors(result, content, projectDir)
        }
      }

      const targets = planEmits(result, component.absPath, componentDirs, options.adapter)
      lastEmitsByAbsPath.set(component.absPath, targets)
      await writeEmits(templatesDir, targets)
    }
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
      if (!targets) continue
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
   * Also (re)writes the dev-artifact marker — see `dev-server.ts`.
   */
  async function runDevEagerPass(devOrigin: string): Promise<void> {
    const config = resolvedConfig
    if (!config) return

    const discovered = await discoverComponents(componentDirs, absPath => readFile(absPath, 'utf8'))
    await emitTemplatesFor(discovered, config.root, component =>
      devScriptAssets(config, devOrigin, component.absPath),
    )

    await writeFile(resolve(templatesDir, DEV_ARTIFACT_MARKER_FILENAME), DEV_ARTIFACT_MARKER_CONTENT)
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
        input[toPosixRelative(guessedRoot, c.absPath)] = c.absPath
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

    configResolved(config) {
      resolvedConfig = config
      componentDirs = options.components.map(d => resolve(config.root, d))
      templatesDir = resolve(config.root, options.templates)
    },

    resolveId(source, importer) {
      return resolveClientJsSpecifier(source, importer)
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

      await emitTemplatesFor(discovered, config.root, component => {
        const manifestKey = toPosixRelative(config.root, component.absPath)
        return resolveScriptAssets(manifest, manifestKey, config.base)
      })

      // A prior `vite dev` run may have left the dev-artifact marker (and
      // dev-origin URLs) behind — this pass just overwrote every template
      // with production URLs, so the marker is now stale. Best-effort:
      // there may never have been one.
      await rm(resolve(templatesDir, DEV_ARTIFACT_MARKER_FILENAME), { force: true })
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
