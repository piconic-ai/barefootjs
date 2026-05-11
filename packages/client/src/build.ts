// CSR build config factory for `barefoot.config.ts`.
//
// CSR (client-side rendering) projects emit client JS only — no marked
// templates, no SSR. Pair this config with `render()` from
// `@barefootjs/client/runtime` on the page.
//
// The compiler still needs a `TemplateAdapter` to drive IR→client-JS
// codegen (template primitives, client-shim resolution, etc.). The marked
// templates the adapter would produce are simply not written to disk.
// `HonoAdapter` is used by default since it accepts the broadest JS surface
// at template scope, matching what the browser can execute.

import type {
  BarefootPaths,
  BundleEntry,
  ExternalSpec,
  OutputLayout,
  PostBuildContext,
  TemplateAdapter,
} from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import type { HonoAdapterOptions } from '@barefootjs/hono/adapter'

export interface CSRBuildOptions {
  /** Project layout paths consumed by registry tooling. */
  paths?: BarefootPaths
  /** Source component directories relative to the config file. */
  components?: string[]
  /** Output directory relative to the config file. */
  outDir?: string
  /** Minify client JS output. */
  minify?: boolean
  /** Add content hash to client JS filenames. */
  contentHash?: boolean
  /** Custom output directory layout. */
  outputLayout?: OutputLayout
  /** Post-build hook called after minification, before manifest write. */
  postBuild?: (ctx: PostBuildContext) => Promise<void> | void
  /** Vendor packages to split out as separately-cached browser chunks. */
  externals?: Record<string, ExternalSpec>
  /** URL base path for vendor chunks in the emitted importmap. */
  externalsBasePath?: string
  /** Additional entry points to bundle with esbuild directly. */
  bundleEntries?: BundleEntry[]
  /**
   * Override the compiler adapter. The marked templates this adapter
   * generates are discarded in CSR mode — set this only if the default
   * `HonoAdapter` clashes with something else in your build.
   */
  adapter?: TemplateAdapter
  /** Options forwarded to the default `HonoAdapter`. Ignored when `adapter` is set. */
  adapterOptions?: HonoAdapterOptions
}

/**
 * Create a BarefootBuildConfig for CSR projects.
 *
 * Uses structural typing — does not import `BarefootBuildConfig` to avoid
 * a circular dependency between `@barefootjs/client` and `@barefootjs/cli`.
 */
export function createConfig(options: CSRBuildOptions = {}) {
  return {
    adapter: options.adapter ?? new HonoAdapter(options.adapterOptions),
    paths: options.paths,
    components: options.components,
    outDir: options.outDir,
    minify: options.minify,
    contentHash: options.contentHash,
    clientOnly: true,
    externals: options.externals,
    externalsBasePath: options.externalsBasePath,
    bundleEntries: options.bundleEntries,
    outputLayout: options.outputLayout,
    postBuild: options.postBuild,
  }
}
