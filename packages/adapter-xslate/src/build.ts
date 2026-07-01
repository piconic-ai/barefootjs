// Text::Xslate build config factory for barefoot.config.ts

import type { BuildOptions } from '@barefootjs/jsx'
import { registerLoweringPlugin } from '@barefootjs/jsx'
import { XslateAdapter } from './adapter/index.ts'
import type { XslateAdapterOptions } from './adapter/index.ts'

export interface XslateBuildOptions extends BuildOptions {
  /** Adapter-specific options passed to XslateAdapter */
  adapterOptions?: XslateAdapterOptions
}

/**
 * Create a BarefootBuildConfig for Text::Xslate (Kolon) template projects.
 *
 * Uses structural typing — does not import BarefootBuildConfig to avoid a
 * circular dependency between @barefootjs/xslate and @barefootjs/cli.
 */
export function createConfig(options: XslateBuildOptions = {}) {
  // Register config-declared call-lowering plugins (#2057) in this module's
  // `@barefootjs/jsx` instance — the one the adapter reads its registry from.
  for (const plugin of options.plugins ?? []) registerLoweringPlugin(plugin)

  return {
    adapter: new XslateAdapter(options.adapterOptions),
    paths: options.paths,
    components: options.components,
    outDir: options.outDir,
    minify: options.minify,
    contentHash: options.contentHash,
    externals: options.externals,
    externalsBasePath: options.externalsBasePath,
    bundleEntries: options.bundleEntries,
    localImportPrefixes: options.localImportPrefixes,
    plugins: options.plugins,
    outputLayout: options.outputLayout ?? {
      templates: 'templates',
      clientJs: 'client',
      runtime: 'client',
    },
    postBuild: options.postBuild,
  }
}
