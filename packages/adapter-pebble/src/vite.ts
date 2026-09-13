/**
 * `@barefootjs/pebble/vite` — a Pebble-specific COMPOSITION of core
 * `@barefootjs/vite`'s `barefoot()`, mirroring `@barefootjs/jinja/vite`'s,
 * `@barefootjs/go-template/vite`'s, and `@barefootjs/blade/vite`'s shape and
 * naming (`barefoot`, named AND default export; a user never passes
 * `adapter`, this constructs `PebbleAdapter` itself).
 *
 *   import { barefoot } from '@barefootjs/pebble/vite'
 *
 *   export default defineConfig({
 *     base: '/integrations/spring/client/',
 *     build: { outDir: 'dist/client' },
 *     plugins: barefoot({
 *       components: ['../shared/components', '../shared/blog'],
 *       templates: 'src/main/resources/templates',
 *     }),
 *   })
 *
 * Ported from `@barefootjs/jinja/vite` (see that file's docstring for the
 * full rationale behind each piece below — `PebbleAdapter.generate()` never
 * produces a `types` section either, so there is nothing to stitch together
 * the way Go's `afterEmit`-driven type-combination step needs).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { barefoot as coreBarefoot } from '@barefootjs/vite'
import type { AfterEmitContext } from '@barefootjs/vite'
import { devModuleUrl, loadManifest, resolveDevOrigin, resolveScriptAssets, toPosixRelative } from '@barefootjs/vite'
import { PebbleAdapter } from './adapter/index.ts'

export interface PebbleViteOptions {
  /** Source directories to scan for `.tsx` components, relative to the
   * Vite project root (or absolute). */
  components: string[]
  /** Where compiled `.peb` templates and `ssrDefaults` land — relative to
   * the Vite project root (or absolute). This is a backend source
   * directory the JVM app reads (e.g. Spring Boot's
   * `src/main/resources/templates`), NOT `build.outDir` (Vite's
   * client-asset output). */
  templates: string
  /**
   * Extra, non-component script entries whose Vite-resolved URL (dev:
   * origin-based; production: content-hashed manifest path) should be
   * exposed to the JVM app as a generated JSON asset map — e.g. a
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
   * committed like Go's `bf_assets.go`: the JVM app reads this file at
   * REQUEST time, so there is nothing to commit; a fresh copy is
   * generated on every build (dev AND production) and never checked in. */
  assetsOutputFile?: string
}

/** write-if-changed: writes `content` to `absPath` only if it differs from
 * what's already there, logging `label` when it actually wrote. Avoids
 * touching mtime (and so falsely tripping a file watcher) on a pass that
 * produced byte-identical output. */
async function writeIfChanged(absPath: string, content: string, label: string): Promise<void> {
  const prev = await readFile(absPath, 'utf-8').catch(() => null)
  if (prev === content) return
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
    if (!devServer) throw new Error(`[pebble/vite] asset "${entryRelPath}": dev server not ready`)
    return devModuleUrl(config, resolveDevOrigin(devServer), absPath)
  }

  const manifestKey = toPosixRelative(config.root, absPath)
  const [url] = resolveScriptAssets(manifest ?? {}, manifestKey, config.base)
  if (!url) {
    throw new Error(
      `[pebble/vite] asset "${entryRelPath}" was not found in the build manifest. ` +
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

export function barefoot(options: PebbleViteOptions): Plugin[] {
  const assets = options.assets ?? {}
  const assetsOutputFile = options.assetsOutputFile ?? 'dist/bf-assets.json'

  let resolvedConfig: ResolvedConfig | undefined
  let devServer: ViteDevServer | undefined

  const core = coreBarefoot({
    adapter: new PebbleAdapter(),
    components: options.components,
    templates: options.templates,
    async afterEmit(ctx) {
      if (Object.keys(assets).length > 0 && resolvedConfig) {
        await writeAssetMap(ctx, resolvedConfig, devServer, assets, assetsOutputFile)
      }
    },
  })

  if (Object.keys(assets).length === 0) return [core]

  const pebbleAssetsConfigCapture: Plugin = {
    name: 'barefoot-pebble-assets-config-capture',
    configResolved(config) {
      resolvedConfig = config
    },
    configureServer(server) {
      devServer = server
    },
  }

  return [core, pebbleAssetsConfigCapture]
}

export { barefoot as default }
