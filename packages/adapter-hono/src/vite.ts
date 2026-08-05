/**
 * `@barefootjs/hono/vite` — a Hono-specific COMPOSITION of core
 * `@barefootjs/vite`'s `barefoot()`, mirroring `@barefootjs/go-template/
 * vite`'s shape and naming (`barefoot`, named AND default export; a user
 * never passes `adapter`, this constructs `HonoAdapter` itself).
 *
 *   import { barefoot } from '@barefootjs/hono/vite'
 *
 *   export default defineConfig({
 *     base: '/static/components/',
 *     build: { outDir: 'dist/static/components' },
 *     plugins: barefoot({
 *       components: ['src/components'],
 *       templates: 'dist/components',
 *     }),
 *   })
 *
 * ## Why this needs no `afterEmit`-driven combination step (unlike Go)
 *
 * `@barefootjs/go-template/vite` exists mainly to combine every discovered
 * file's `types` fragment into ONE compilable `components.go` — Go's
 * per-file fragments assume a shared `randomID` helper and a single package
 * header, so they are not independently valid Go source (see that module's
 * docstring). Hono's SSR marked template has no such constraint: `generate()`
 * already emits a complete, self-contained `.tsx` file (its own imports,
 * its own types inlined via `sections.types`) that wrangler/bun's own
 * bundler compiles directly — there is nothing across files that needs
 * stitching together. So this composition's core job is just what core's
 * `barefoot()` already does: construct `HonoAdapter` and hand it to core.
 *
 * ## `assets` — the one thing this DOES need, mirroring go-template/vite
 *
 * A hand-written, non-component client bootstrap (e.g. this integration's
 * `client/router-entry.ts`, which boots `@barefootjs/router`) isn't a
 * `.tsx` component, so core's own discovery/`scriptAssets` machinery never
 * sees it — but a plain `.tsx` SSR file (e.g. a blog layout) still needs a
 * `<script src>` for it, and that URL is only knowable after Vite bundles it
 * (dev: origin-based; build: manifest-hashed). `assets` resolves exactly
 * that, into a generated TS module the SSR file can `import` — the
 * TypeScript analogue of `@barefootjs/go-template/vite`'s generated
 * `bf_assets.go`. See that module's docstring for the full "why a
 * companion config-capture plugin" rationale (`afterEmit`'s
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
import { HonoAdapter } from './adapter/index.ts'
import type { HonoAdapterOptions } from './adapter/index.ts'

export interface HonoViteOptions {
  /** Source directories to scan for `.tsx` components, relative to the
   * Vite project root (or absolute). */
  components: string[]
  /** Where compiled SSR templates (and `ssrDefaults`) land — relative to
   * the Vite project root (or absolute). This is a backend source
   * directory wrangler/bun's own bundler reads, NOT `build.outDir` (Vite's
   * client-asset output). */
  templates: string
  /** Adapter-specific options passed to `HonoAdapter` (e.g. `clientJsFilename`). */
  adapterOptions?: HonoAdapterOptions
  /**
   * Extra, non-component script entries whose Vite-resolved URL (dev:
   * origin-based; production: content-hashed manifest path) should be
   * exposed to the SSR app as a generated `Assets` map — e.g. a
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
  /** Output path for the generated asset-map TS module, relative to the
   * Vite project root. Default: 'dist/bf-assets.ts'. Ignored when `assets`
   * is empty. */
  assetsOutputFile?: string
}

/** write-if-changed: writes `content` to `absPath` only if it differs from
 * what's already there, logging `label` when it actually wrote. Avoids
 * touching mtime (and so falsely tripping a file watcher, e.g. wrangler's
 * own dev rebuild) on a pass that produced byte-identical output. */
async function writeIfChanged(absPath: string, content: string, label: string): Promise<void> {
  const prev = await readFile(absPath, 'utf-8').catch(() => null)
  if (prev === content) return
  // Unlike `@barefootjs/go-template/vite`'s `bf_assets.go` (project root by
  // default), this plugin's default `assetsOutputFile` lives under `dist/`
  // — a directory `vite build` may not have created yet on a clean
  // checkout (nothing else in this plugin writes there before `afterEmit`
  // runs), so ensure it exists before writing.
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
    if (!devServer) throw new Error(`[hono/vite] asset "${entryRelPath}": dev server not ready`)
    return devModuleUrl(config, resolveDevOrigin(devServer), absPath)
  }

  const manifestKey = toPosixRelative(config.root, absPath)
  const [url] = resolveScriptAssets(manifest ?? {}, manifestKey, config.base)
  if (!url) {
    throw new Error(
      `[hono/vite] asset "${entryRelPath}" was not found in the build manifest. ` +
        `Did you also add it to build.rollupOptions.input?`,
    )
  }
  return url
}

/** Builds and write-if-changed's the generated TS asset map. No-op when
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

  const entries = keys
    .map(name => `  ${JSON.stringify(name)}: ${JSON.stringify(resolveAssetUrl(ctx, config, devServer, assets[name]!, manifest))},`)
    .join('\n')

  const content = [
    `// Code generated by BarefootJS. DO NOT EDIT.`,
    '',
    `/**`,
    ` * Maps a logical asset name (this map's key) to its resolved URL for`,
    ` * the current build: a Vite dev-server origin URL in dev, a`,
    ` * content-hashed manifest path in production. Regenerated by`,
    ` * @barefootjs/hono/vite's afterEmit hook every time templates are`,
    ` * (re)emitted.`,
    ` */`,
    `export const Assets: Record<string, string> = {`,
    entries,
    `}`,
  ].join('\n') + '\n'

  await writeIfChanged(resolve(ctx.projectDir, assetsOutputFile), content, assetsOutputFile)
}

export function barefoot(options: HonoViteOptions): Plugin[] {
  const assets = options.assets ?? {}
  const assetsOutputFile = options.assetsOutputFile ?? 'dist/bf-assets.ts'

  // Populated by `honoAssetsConfigCapture` below (only added to the
  // returned array when `assets` is non-empty). Read by `afterEmit` — see
  // `@barefootjs/go-template/vite`'s identical mechanism for the ordering
  // guarantee (`configResolved`/`configureServer` always run before the
  // eager pass that triggers `afterEmit`, for both build and dev).
  let resolvedConfig: ResolvedConfig | undefined
  let devServer: ViteDevServer | undefined

  const core = coreBarefoot({
    adapter: new HonoAdapter(options.adapterOptions),
    components: options.components,
    templates: options.templates,
    async afterEmit(ctx) {
      if (Object.keys(assets).length > 0 && resolvedConfig) {
        await writeAssetMap(ctx, resolvedConfig, devServer, assets, assetsOutputFile)
      }
    },
  })

  if (Object.keys(assets).length === 0) return [core]

  const honoAssetsConfigCapture: Plugin = {
    name: 'barefoot-hono-assets-config-capture',
    configResolved(config) {
      resolvedConfig = config
    },
    configureServer(server) {
      devServer = server
    },
  }

  return [core, honoAssetsConfigCapture]
}

export { barefoot as default }
