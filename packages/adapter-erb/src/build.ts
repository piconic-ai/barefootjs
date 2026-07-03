// ERB build config factory for barefoot.config.ts

import type { BuildOptions } from '@barefootjs/jsx'
import { ErbAdapter } from './adapter/index.ts'
import type { ErbAdapterOptions } from './adapter/index.ts'

export interface ErbBuildOptions extends BuildOptions {
  /** Adapter-specific options passed to ErbAdapter */
  adapterOptions?: ErbAdapterOptions
}

/**
 * Create a BarefootBuildConfig for ERB (Embedded Ruby) template projects.
 *
 * Uses structural typing — does not import BarefootBuildConfig to avoid a
 * circular dependency between @barefootjs/erb and @barefootjs/cli.
 */
export function createConfig(options: ErbBuildOptions = {}) {
  return {
    adapter: new ErbAdapter(options.adapterOptions),
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
