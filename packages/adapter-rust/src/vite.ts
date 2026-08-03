/**
 * `@barefootjs/rust/vite` — a minijinja(Rust)-specific COMPOSITION of core
 * `@barefootjs/vite`'s `barefoot()`, mirroring `@barefootjs/go-template/
 * vite`'s, `@barefootjs/hono/vite`'s, `@barefootjs/blade/vite`'s,
 * `@barefootjs/jinja/vite`'s, and `@barefootjs/erb/vite`'s shape and naming
 * (`barefoot`, named AND default export; a user never passes `adapter`,
 * this constructs `MinijinjaAdapter` itself).
 *
 *   import { barefoot } from '@barefootjs/rust/vite'
 *
 *   export default defineConfig({
 *     base: '/integrations/axum/client/',
 *     build: { outDir: 'dist/client' },
 *     plugins: barefoot({
 *       components: ['../shared/components', '../shared/blog'],
 *       templates: 'dist/templates',
 *     }),
 *   })
 *
 * ## Why this needs no `afterEmit`-driven type-combination step (unlike Go)
 *
 * `@barefootjs/go-template/vite` exists mainly to combine every discovered
 * file's `types` fragment into ONE compilable `components.go` — Go's
 * per-file fragments assume a shared `randomID` helper and a single package
 * header, so they are not independently valid Go source, and an unused
 * import fails the build outright (see that module's docstring).
 * `MinijinjaAdapter.generate()` never produces a `types` section at all
 * (minijinja templates have no JS-style imports/types/exports to combine —
 * see `minijinja-adapter.ts`'s `generate()`, whose `sections.types` is
 * always `''`), so there is nothing across files to stitch together, and no
 * unused-import failure mode to guard against either. Confirmed by reading
 * `./build.ts`'s `createConfig`: unlike Go's, it has NO default `postBuild`
 * of its own — it only forwards a caller-supplied one verbatim. So this
 * composition's core job is just what core's `barefoot()` already does:
 * construct `MinijinjaAdapter` and hand it to core.
 *
 * ## No `adapterOptions` either — the other thing Go/Hono still need
 *
 * `MinijinjaAdapterOptions` has exactly two fields, `clientJsBasePath` and
 * `barefootJsPath` — and `MinijinjaAdapter.generateScriptRegistrations`
 * only falls back to them when `scriptAssets` is `undefined` (the legacy
 * `bf build` path). Core's `barefoot()` plugin ALWAYS passes a resolved
 * `scriptAssets` array (build: manifest-hashed; dev: origin-based — see
 * `plugin.ts`), so that fallback is dead code on every Vite-driven build.
 * Unlike Go (`packageName`, still real) or Hono (`clientJsFilename`, still
 * real), minijinja has no adapter option left with any effect once Vite
 * drives the build — so this options interface simply omits the field
 * rather than plumbing through two options that would always be ignored.
 *
 * ## `assets` — the one thing this DOES need, mirroring go-template/hono/blade
 *
 * A hand-written, non-component client bootstrap (e.g. an integration's
 * `client/router-entry.ts`, which boots `@barefootjs/router` for the blog)
 * isn't a `.tsx` component, so core's own discovery/`scriptAssets` machinery
 * never sees it — but the compiled blog shell still needs a `<script src>`
 * for it, and that URL is only knowable after Vite bundles it (dev:
 * origin-based; build: manifest-hashed). `assets` resolves exactly that,
 * into a generated JSON file the Rust app reads at request time (the same
 * `dist/templates/manifest.json` — read-a-JSON-file-at-runtime — idiom this
 * Rust binary already uses for `ssrDefaults`; unlike Go/Hono there is no
 * compile step on the Rust side that needs the URL baked in ahead of time
 * — a plain JSON file read at startup is enough — no generated Go/TS
 * source needed). See `@barefootjs/go-template/vite`'s docstring for the
 * full "why a companion config-capture plugin" rationale (`afterEmit`'s
 * `AfterEmitContext` is deliberately narrow — no `ResolvedConfig`, no dev
 * origin, no manifest — so a tiny second plugin captures those via its own
 * `configResolved`/`configureServer` hooks for `afterEmit`, in the same
 * closure, to read).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { barefoot as coreBarefoot } from '@barefootjs/vite'
import type { AfterEmitContext } from '@barefootjs/vite'
import { devModuleUrl, loadManifest, resolveDevOrigin, resolveScriptAssets, toPosixRelative } from '@barefootjs/vite'
import { MinijinjaAdapter } from './adapter/index.ts'

export interface RustViteOptions {
  /** Source directories to scan for `.tsx` components, relative to the
   * Vite project root (or absolute). */
  components: string[]
  /** Where compiled `.j2` templates and `ssrDefaults` land — relative to
   * the Vite project root (or absolute). This is a backend source
   * directory the Rust binary reads, NOT `build.outDir` (Vite's
   * client-asset output). */
  templates: string
  /**
   * Extra, non-component script entries whose Vite-resolved URL (dev:
   * origin-based; production: content-hashed manifest path) should be
   * exposed to the Rust app as a generated JSON asset map — e.g. a
   * hand-written client bootstrap script that isn't a `.tsx` component, so
   * it never goes through core's discovery/`scriptAssets` machinery, but
   * still needs a `<script src="...">` URL only knowable after bundling.
   *
   * Keyed by the identifier the resolved URL should appear under in the
   * generated map; values are entry paths relative to the Vite project
   * root. You must ALSO register the same path as a Rollup entry yourself
   * via stock `build.rollupOptions.input` — this plugin never adds
   * bundling configuration on your behalf; this option only resolves the
   * URL Vite already bundled it to, it doesn't request the bundling.
   */
  assets?: Record<string, string>
  /** Output path for the generated JSON asset map, relative to the Vite
   * project root. Default: 'dist/bf-assets.json'. Ignored when `assets`
   * is empty. Placed under `dist/` (already gitignored) rather than
   * committed like Go's `bf_assets.go`: the Rust app reads this file at
   * STARTUP, so — unlike Go, which must compile a static map into the
   * binary — there is nothing to commit; a fresh copy is generated on
   * every build (dev AND production) and never checked in. */
  assetsOutputFile?: string
}

/** write-if-changed: writes `content` to `absPath` only if it differs from
 * what's already there, logging `label` when it actually wrote. Avoids
 * touching mtime (and so falsely tripping a file watcher) on a pass that
 * produced byte-identical output. */
async function writeIfChanged(absPath: string, content: string, label: string): Promise<void> {
  const prev = await readFile(absPath, 'utf-8').catch(() => null)
  if (prev === content) return
  // Default `assetsOutputFile` lives under `dist/` — a directory `vite
  // build` may not have created yet on a clean checkout — so ensure it
  // exists before writing.
  await mkdir(dirname(absPath), { recursive: true })
  await writeFile(absPath, content)
  console.log(`Generated: ${label}`)
}

/** Resolves ONE asset entry's URL for the current pass: manifest-hashed for
 * `mode: 'build'`, dev-origin-based for `mode: 'dev'`. Throws with an
 * actionable message when the entry isn't in the build manifest — almost
 * always means the caller forgot to also add it to
 * `build.rollupOptions.input`. */
function resolveAssetUrl(
  ctx: AfterEmitContext,
  config: ResolvedConfig,
  devServer: ViteDevServer | undefined,
  entryRelPath: string,
  manifest: Record<string, { file: string }> | undefined,
): string {
  const absPath = resolve(ctx.projectDir, entryRelPath)
  if (ctx.mode === 'dev') {
    if (!devServer) throw new Error(`[rust/vite] asset "${entryRelPath}": dev server not ready`)
    return devModuleUrl(config, resolveDevOrigin(devServer), absPath)
  }

  const manifestKey = toPosixRelative(config.root, absPath)
  const [url] = resolveScriptAssets(manifest ?? {}, manifestKey, config.base)
  if (!url) {
    throw new Error(
      `[rust/vite] asset "${entryRelPath}" was not found in the build manifest. ` +
        `Did you also add it to build.rollupOptions.input?`,
    )
  }
  return url
}

/** Builds and write-if-changed's the generated JSON asset map. No-op when
 * `assets` is empty. */
async function writeAssetMap(
  ctx: AfterEmitContext,
  config: ResolvedConfig,
  devServer: ViteDevServer | undefined,
  assets: Record<string, string>,
  assetsOutputFile: string,
): Promise<void> {
  const keys = Object.keys(assets)
  if (keys.length === 0) return

  const manifest = ctx.mode === 'build' ? await loadManifest(ctx.outDir, config.build.manifest) : undefined

  const resolved: Record<string, string> = {}
  for (const name of keys) {
    resolved[name] = resolveAssetUrl(ctx, config, devServer, assets[name]!, manifest)
  }

  const content = `${JSON.stringify(resolved, null, 2)}\n`
  await writeIfChanged(resolve(ctx.projectDir, assetsOutputFile), content, assetsOutputFile)
}

export function barefoot(options: RustViteOptions): Plugin[] {
  const assets = options.assets ?? {}
  const assetsOutputFile = options.assetsOutputFile ?? 'dist/bf-assets.json'

  // Populated by `rustAssetsConfigCapture` below (only added to the
  // returned array when `assets` is non-empty). Read by `afterEmit` — see
  // `@barefootjs/go-template/vite`'s identical mechanism for the ordering
  // guarantee (`configResolved`/`configureServer` always run before the
  // eager pass that triggers `afterEmit`, for both build and dev).
  let resolvedConfig: ResolvedConfig | undefined
  let devServer: ViteDevServer | undefined

  const core = coreBarefoot({
    adapter: new MinijinjaAdapter(),
    components: options.components,
    templates: options.templates,
    async afterEmit(ctx) {
      if (Object.keys(assets).length > 0 && resolvedConfig) {
        await writeAssetMap(ctx, resolvedConfig, devServer, assets, assetsOutputFile)
      }
    },
  })

  if (Object.keys(assets).length === 0) return [core]

  const rustAssetsConfigCapture: Plugin = {
    name: 'barefoot-rust-assets-config-capture',
    configResolved(config) {
      resolvedConfig = config
    },
    configureServer(server) {
      devServer = server
    },
  }

  return [core, rustAssetsConfigCapture]
}

export { barefoot as default }
