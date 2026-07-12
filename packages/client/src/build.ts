// CSR build config factory for `barefoot.config.ts`.
//
// CSR (client-side rendering) projects emit client JS only — no marked
// templates, no SSR. Pair this config with `render()` from
// `@barefootjs/client/runtime` on the page.
//
// The compiler still needs a `TemplateAdapter` to drive IR→client-JS
// codegen (the analyzer consults `acceptsTemplateCall` when deciding
// template-scope vs init-scope placement). The marked templates the
// adapter would produce are simply not written to disk. The default
// `CSRAdapter` is the minimum that satisfies the interface — its
// `generate()` returns an empty `AdapterOutput` and the build
// pipeline drops the empty marked-template file at the
// `clientOnly` gate.
//
// (Pre-1.0 this was `HonoAdapter` from `@barefootjs/hono/adapter`,
// which pulled the entire Hono package into a CSR app's
// `node_modules` for output that was always thrown away. See
// `csr-adapter.ts` for the rationale on the new in-package adapter.)

import type {
  BarefootPaths,
  BundleEntry,
  ExternalSpec,
  OutputLayout,
  PostBuildContext,
  TemplateAdapter,
} from '@barefootjs/jsx'
import { CSRAdapter } from './csr-adapter.ts'
import type { CSRAdapterOptions } from './csr-adapter.ts'

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
   * generates are discarded in CSR mode — set this only if you need
   * a different `TemplateAdapter` (e.g. a custom test adapter).
   */
  adapter?: TemplateAdapter
  /** Options forwarded to the default `CSRAdapter`. Ignored when `adapter` is set. */
  adapterOptions?: CSRAdapterOptions
  /**
   * How the CLI produces `barefoot.js`. Defaults to `'treeshake'`, which
   * bundles only the runtime exports this project's compiled client JS
   * actually imports (plus the always-kept public mount API). Set to
   * `'treeshake-exact'` to drop the always-kept set too — smaller output,
   * but any hand-written page script the CLI never compiles (an inline
   * `<script type="module">` calling `render`/`hydrate`/etc. directly) must
   * list those names in `runtimeKeep` or they're silently dropped. Set to
   * `'full'` to copy the entire prebuilt runtime bundle verbatim, matching
   * pre-tree-shaking behavior.
   */
  runtimeBundle?: 'treeshake' | 'treeshake-exact' | 'full'
  /**
   * Extra `@barefootjs/client*` export names to force-keep in `barefoot.js`
   * under `runtimeBundle: 'treeshake'` or `'treeshake-exact'` — for names
   * only ever referenced from hand-written page scripts the CLI never
   * compiles. Required (not just useful) under `'treeshake-exact'`, which
   * drops the always-kept public mount API those scripts would otherwise
   * fall back on.
   */
  runtimeKeep?: string[]
}

/**
 * Create a BarefootBuildConfig for CSR projects.
 *
 * Uses structural typing — does not import `BarefootBuildConfig` to avoid
 * a circular dependency between `@barefootjs/client` and `@barefootjs/cli`.
 */
export function createConfig(options: CSRBuildOptions = {}) {
  // `name` defaults to `'csr'` inside `CSRAdapter`; a caller-supplied
  // `adapterOptions.name` (or a fully-custom `adapter`) wins, matching
  // the pre-decoupling behaviour where `bf build`'s `Adapter: …`
  // banner reflected the option override.
  const adapter = options.adapter ?? new CSRAdapter(options.adapterOptions)
  return {
    adapter,
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
    runtimeBundle: options.runtimeBundle,
    runtimeKeep: options.runtimeKeep,
  }
}

export { CSRAdapter } from './csr-adapter.ts'
export type { CSRAdapterOptions } from './csr-adapter.ts'
