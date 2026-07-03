// Jinja2 build config factory for barefoot.config.ts

import type { BuildOptions } from '@barefootjs/jsx'
import { JinjaAdapter } from './adapter/index.ts'
import type { JinjaAdapterOptions } from './adapter/index.ts'

export interface JinjaBuildOptions extends BuildOptions {
  /** Adapter-specific options passed to JinjaAdapter */
  adapterOptions?: JinjaAdapterOptions
}

/**
 * Create a BarefootBuildConfig for Jinja2 template projects.
 *
 * Uses structural typing — does not import BarefootBuildConfig to avoid a
 * circular dependency between @barefootjs/jinja and @barefootjs/cli.
 */
export function createConfig(options: JinjaBuildOptions = {}) {
  return {
    adapter: new JinjaAdapter(options.adapterOptions),
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
