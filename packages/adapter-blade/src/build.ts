// Blade build config factory for barefoot.config.ts

import type { BuildOptions } from '@barefootjs/jsx'
import { BladeAdapter } from './adapter/index.ts'
import type { BladeAdapterOptions } from './adapter/index.ts'

export interface BladeBuildOptions extends BuildOptions {
  /** Adapter-specific options passed to BladeAdapter */
  adapterOptions?: BladeAdapterOptions
}

/**
 * Create a BarefootBuildConfig for Blade (PHP) template projects.
 *
 * Uses structural typing — does not import BarefootBuildConfig to avoid a
 * circular dependency between @barefootjs/blade and @barefootjs/cli.
 */
export function createConfig(options: BladeBuildOptions = {}) {
  return {
    adapter: new BladeAdapter(options.adapterOptions),
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
