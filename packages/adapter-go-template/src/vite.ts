/**
 * `@barefootjs/go-template/vite` — a Go-specific COMPOSITION of core
 * `@barefootjs/vite`'s `barefoot()`, not a new plugin implementation. Per
 * the design brief: the generic escape hatch (`afterEmit`) lives in core;
 * everything Go-specific (constructing `GoTemplateAdapter`, combining
 * per-file `types` output into one compilable `components.go`, and — for
 * apps with a hand-written non-component script entry — a generated Go
 * asset map) is confined here so core never needs to know Go exists.
 *
 * The asset map is split across TWO build-tagged files declaring the same
 * `Assets` symbol (see `writeAssetMap`/`renderAssetMapFile` below): a
 * `!production`-tagged dev file (committed — dev-server URLs never change)
 * and a `production`-tagged sibling (gitignored — hashed build URLs churn
 * every `vite build`). The untagged default is DEV, so `go run .` on a
 * fresh clone with no prior build just works; a production build/deploy
 * must pass `-tags production` or it silently compiles the dev file's
 * localhost URLs — `bfdev.GuardAssets` (Go runtime) is the loud failure for
 * that mistake.
 *
 * A user never passes `adapter` — this wraps core's `barefoot()` and
 * constructs `GoTemplateAdapter` itself, mirroring `@barefootjs/go-
 * template/build`'s `createConfig` (same idea, moved from the legacy CLI
 * config shape onto a Vite plugin):
 *
 *   import { barefoot } from '@barefootjs/go-template/vite'
 *
 *   export default defineConfig({
 *     base: '/static/build/',
 *     build: { outDir: 'static/build' },
 *     plugins: [barefoot({
 *       components: ['src/components'],
 *       templates: 'internal/views',
 *       packageName: 'main',
 *       typesOutputFile: 'components.go',
 *     })],
 *   })
 *
 * Named `barefoot` (not `barefootGo`) both as a named AND default export,
 * matching core's `packages/vite/src/index.ts` exactly: the import
 * specifier already names the adapter, so the identifier doesn't need to
 * repeat it — and swapping adapters later only changes the specifier, not
 * every call site's identifier.
 *
 * ## Why this returns `Plugin[]`, not a single `Plugin`
 *
 * `afterEmit`'s context (per core's `types.ts`) is DELIBERATELY narrow:
 * `types` / `projectDir` / `templatesDir` / `outDir` / `mode` — no
 * `ResolvedConfig`, no dev origin, no manifest. Combining `types` into
 * `components.go` needs nothing more than that. But the OPTIONAL `assets`
 * map (see below) needs to resolve a Vite-bundled URL for a file core's
 * own component discovery never sees, which needs the SAME machinery core
 * itself uses internally (`ResolvedConfig`, the dev origin, the build
 * manifest) — none of which `afterEmit` carries, on purpose. A tiny
 * companion plugin (`goAssetsConfigCapture` below) exists SOLELY to
 * capture that context via its own `configResolved`/`configureServer`
 * hooks into closure variables `afterEmit` (defined in the SAME closure)
 * reads when it fires. It contributes no `types`/template logic of its
 * own — the actual `components.go`/asset-map WRITES both still happen
 * inside the ONE `afterEmit` callback, per the design brief's
 * recommendation. Returning `[core]` alone when `assets` is empty (the
 * common case) keeps the single-plugin shape for anyone inspecting the
 * array's length; Vite flattens either way.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { barefoot as coreBarefoot } from '@barefootjs/vite'
import type { AfterEmitContext } from '@barefootjs/vite'
import { devModuleUrl, loadManifest, resolveDevOrigin, resolveScriptAssets, toPosixRelative } from '@barefootjs/vite'
import { GoTemplateAdapter } from './adapter/index.ts'
import { combineGoTypes } from './go-types.ts'

export interface GoTemplateViteOptions {
  /** Source directories to scan for `.tsx` components, relative to the
   * Vite project root (or absolute). */
  components: string[]
  /** Where compiled templates, `ssrDefaults`, and `components.go` land —
   * relative to the Vite project root (or absolute). */
  templates: string
  /** Go package name for generated types (default: 'main'). */
  packageName?: string
  /** Output path for the combined Go types file, relative to the Vite
   * project root (default: 'components.go'). */
  typesOutputFile?: string
  /** Manual type definitions to append (app-specific types not generated
   * from components). */
  manualTypes?: string
  /** Transform the combined types string before writing (for app-specific
   * type fixes). */
  transformTypes?: (types: string) => string
  /**
   * Extra, non-component script entries whose Vite-resolved URL (dev:
   * origin-based; production: content-hashed manifest path) should be
   * exposed to Go code as a generated asset map — e.g. a hand-written
   * client bootstrap script (a router entry point, say) that isn't a
   * `.tsx` component, so it never goes through core's discovery/
   * `scriptAssets` machinery, but still needs a `<script src="...">` URL
   * only knowable after bundling.
   *
   * Keyed by the Go identifier the resolved URL should appear under in
   * the generated map; values are entry paths relative to the Vite
   * project root. You must ALSO register the same path as a Rollup entry
   * yourself via stock `build.rollupOptions.input` — this plugin never
   * adds bundling configuration on your behalf (per the design's
   * "everything except adapter/components/templates is stock Vite
   * config"); this option only resolves the URL Vite already bundled it
   * to, it doesn't request the bundling.
   */
  assets?: Record<string, string>
  /**
   * Output path for the DEV asset-map file, relative to the Vite project
   * root. Default: 'bf_assets.go'. Ignored when `assets` is empty.
   *
   * Two build-tagged files declare the SAME `Assets` symbol so exactly one
   * compiles: this one carries `//go:build !production` (the untagged
   * default — a fresh clone with no prior `vite build` still compiles) and
   * holds dev-server-origin URLs, which never change between rebuilds, so
   * it's safe — and meant — to commit. Its sibling (this path with `.go`
   * replaced by `_prod.go`, e.g. `bf_assets_prod.go`) carries
   * `//go:build production`, holds content-hashed build URLs that change
   * every `vite build`, and is gitignored; compiling against it needs
   * `-tags production`.
   */
  assetsOutputFile?: string
}

/** write-if-changed: writes `content` to `absPath` only if it differs from
 * what's already there, logging `label` when it actually wrote. Shared by
 * both `components.go` and the asset map for the same reason `./build`'s
 * `createConfig` uses it: an unrelated eager pass (triggered by editing a
 * DIFFERENT component) touching a generated file's mtime would falsely
 * trip a Go-side file watcher (`air`, etc.) into a no-op rebuild. */
async function writeIfChanged(absPath: string, content: string, label: string): Promise<void> {
  const prev = await readFile(absPath, 'utf-8').catch(() => null)
  if (prev === content) return
  await writeFile(absPath, content)
  console.log(`Generated: ${label}`)
}

/**
 * Combines this pass's `types` fragments into `components.go`. Shared by
 * both build and dev — Go's generated file has to exist for `go run .` to
 * even compile in dev, which is exactly why `afterEmit` fires from both
 * passes (see core's docstring).
 */
async function writeCombinedTypes(
  ctx: AfterEmitContext,
  packageName: string,
  typesOutputFile: string,
  manualTypes: string | undefined,
  transformTypes: ((types: string) => string) | undefined,
): Promise<void> {
  if (ctx.types.size === 0) return

  const content = combineGoTypes({ types: ctx.types, packageName, manualTypes, transformTypes })
  if (!content) return

  await writeIfChanged(resolve(ctx.projectDir, typesOutputFile), content, typesOutputFile)
}

/** Resolves ONE asset entry's URL for the current pass: manifest-hashed for
 * `mode: 'build'`, dev-origin-based for `mode: 'dev'`. Throws with an
 * actionable message when the entry isn't in the build manifest — almost
 * always means the caller forgot to also add it to
 * `build.rollupOptions.input`, and a silently-empty/broken URL baked into
 * generated Go source is a much worse failure mode to debug than a build-
 * time error naming exactly what's missing. */
function resolveAssetUrl(
  ctx: AfterEmitContext,
  config: ResolvedConfig,
  devServer: ViteDevServer | undefined,
  entryRelPath: string,
  manifest: Record<string, { file: string }> | undefined,
): string {
  const absPath = resolve(ctx.projectDir, entryRelPath)
  if (ctx.mode === 'dev') {
    if (!devServer) throw new Error(`[go-template/vite] asset "${entryRelPath}": dev server not ready`)
    return devModuleUrl(config, resolveDevOrigin(devServer), absPath)
  }

  const manifestKey = toPosixRelative(config.root, absPath)
  const [url] = resolveScriptAssets(manifest ?? {}, manifestKey, config.base)
  if (!url) {
    throw new Error(
      `[go-template/vite] asset "${entryRelPath}" was not found in the build manifest. ` +
        `Did you also add it to build.rollupOptions.input?`,
    )
  }
  return url
}

/** Derives the gitignored production sibling of a dev `assetsOutputFile`
 * (`bf_assets.go` → `bf_assets_prod.go`). See `GoTemplateViteOptions.
 * assetsOutputFile`'s docstring for why there are two files. */
function prodAssetsOutputFile(devAssetsOutputFile: string): string {
  return devAssetsOutputFile.replace(/\.go$/, '_prod.go')
}

/** Renders the generated Go asset-map file for ONE side of the dev/prod
 * split: `buildTag` is the `//go:build` constraint that gates it, `entries`
 * the already-rendered map body. Both call sites (dev and build passes)
 * share this so the two files stay textually identical apart from the tag,
 * the URLs, and which sibling they name in the doc comment. */
function renderAssetMapFile(
  packageName: string,
  buildTag: string,
  entries: string,
  devFile: string,
  prodFile: string,
): string {
  return [
    `// Code generated by BarefootJS. DO NOT EDIT.`,
    '',
    `//go:build ${buildTag}`,
    '',
    `package ${packageName}`,
    '',
    `// Assets maps a logical asset name (this map's key) to its resolved URL.`,
    `// Two build-tagged files declare this SAME symbol so exactly one`,
    `// compiles: ${devFile} (tag !production, the untagged default) holds`,
    `// Vite dev-server-origin URLs and is committed since they're stable`,
    `// across rebuilds; ${prodFile} (tag production, gitignored) holds`,
    `// content-hashed build URLs that change every \`vite build\`. Compile`,
    `// against the production build with \`-tags production\`. Regenerated`,
    `// by @barefootjs/go-template/vite's afterEmit hook every time templates`,
    `// are (re)emitted.`,
    `var Assets = map[string]string{`,
    entries,
    `}`,
  ].join('\n') + '\n'
}

/** Builds and write-if-changed's the generated Go asset map for the CURRENT
 * pass only: `ctx.mode === 'dev'` writes the `!production`-tagged
 * `assetsOutputFile` (dev URLs, committed); `ctx.mode === 'build'` writes
 * the `production`-tagged sibling (hashed URLs, gitignored). No-op when
 * `assets` is empty. */
async function writeAssetMap(
  ctx: AfterEmitContext,
  config: ResolvedConfig,
  devServer: ViteDevServer | undefined,
  assets: Record<string, string>,
  packageName: string,
  assetsOutputFile: string,
): Promise<void> {
  const keys = Object.keys(assets)
  if (keys.length === 0) return

  const manifest = ctx.mode === 'build' ? await loadManifest(ctx.outDir, config.build.manifest) : undefined

  const entries = keys
    .map(goName => `\t${JSON.stringify(goName)}: ${JSON.stringify(resolveAssetUrl(ctx, config, devServer, assets[goName]!, manifest))},`)
    .join('\n')

  const prodFile = prodAssetsOutputFile(assetsOutputFile)
  const [buildTag, outputFile] = ctx.mode === 'dev' ? ['!production', assetsOutputFile] : ['production', prodFile]
  const content = renderAssetMapFile(packageName, buildTag, entries, assetsOutputFile, prodFile)

  await writeIfChanged(resolve(ctx.projectDir, outputFile), content, outputFile)
}

export function barefoot(options: GoTemplateViteOptions): Plugin[] {
  const packageName = options.packageName ?? 'main'
  const typesOutputFile = options.typesOutputFile ?? 'components.go'
  const assets = options.assets ?? {}
  const assetsOutputFile = options.assetsOutputFile ?? 'bf_assets.go'

  // Populated by `goAssetsConfigCapture` below (only added to the returned
  // array when `assets` is non-empty). Read by `afterEmit`, which always
  // fires strictly after both `configResolved` (build AND dev — Vite/
  // Rollup run every plugin's `configResolved` before any `writeBundle`)
  // and `configureServer` (dev — `configureServer` itself is what
  // SCHEDULES core's dev pass, so it has always already run by the time
  // that pass, and hence `afterEmit`, fires).
  let resolvedConfig: ResolvedConfig | undefined
  let devServer: ViteDevServer | undefined

  const core = coreBarefoot({
    adapter: new GoTemplateAdapter({ packageName }),
    components: options.components,
    templates: options.templates,
    async afterEmit(ctx) {
      await writeCombinedTypes(ctx, packageName, typesOutputFile, options.manualTypes, options.transformTypes)
      if (Object.keys(assets).length > 0 && resolvedConfig) {
        await writeAssetMap(ctx, resolvedConfig, devServer, assets, packageName, assetsOutputFile)
      }
    },
  })

  if (Object.keys(assets).length === 0) return [core]

  const goAssetsConfigCapture: Plugin = {
    name: 'barefoot-go-assets-config-capture',
    configResolved(config) {
      resolvedConfig = config
    },
    configureServer(server) {
      devServer = server
    },
  }

  return [core, goAssetsConfigCapture]
}

export { barefoot as default }
