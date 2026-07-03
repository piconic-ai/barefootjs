// Twig build config factory for barefoot.config.ts

import type { BuildOptions } from '@barefootjs/jsx'
import { TwigAdapter } from './adapter/index.ts'
import type { TwigAdapterOptions } from './adapter/index.ts'

export interface TwigBuildOptions extends BuildOptions {
  /** Adapter-specific options passed to TwigAdapter */
  adapterOptions?: TwigAdapterOptions
}

/**
 * Create a BarefootBuildConfig for Twig (PHP) template projects.
 *
 * Uses structural typing — does not import BarefootBuildConfig to avoid a
 * circular dependency between @barefootjs/twig and @barefootjs/cli.
 */
export function createConfig(options: TwigBuildOptions = {}) {
  return {
    adapter: new TwigAdapter(options.adapterOptions),
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
