// minijinja (Rust) build config factory for barefoot.config.ts

import type { BuildOptions } from '@barefootjs/jsx'
import { MinijinjaAdapter } from './adapter/index.ts'
import type { MinijinjaAdapterOptions } from './adapter/index.ts'

export interface MinijinjaBuildOptions extends BuildOptions {
  /** Adapter-specific options passed to MinijinjaAdapter */
  adapterOptions?: MinijinjaAdapterOptions
}

/**
 * Create a BarefootBuildConfig for minijinja (Jinja2-compatible) template
 * projects.
 *
 * Uses structural typing — does not import BarefootBuildConfig to avoid a
 * circular dependency between @barefootjs/rust and @barefootjs/cli.
 */
export function createConfig(options: MinijinjaBuildOptions = {}) {
  return {
    adapter: new MinijinjaAdapter(options.adapterOptions),
    paths: options.paths,
    components: options.components,
    outDir: options.outDir,
    minify: options.minify,
    contentHash: options.contentHash,
    externals: options.externals,
    externalsBasePath: options.externalsBasePath,
    bundleEntries: options.bundleEntries,
    localImportPrefixes: options.localImportPrefixes,
    outputLayout: options.outputLayout ?? {
      templates: 'templates',
      clientJs: 'client',
      runtime: 'client',
    },
    postBuild: options.postBuild,
  }
}
