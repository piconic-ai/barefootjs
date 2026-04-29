// Mojolicious build config factory for barefoot.config.ts

import type { BuildOptions } from '@barefootjs/jsx'
import { MojoAdapter } from './adapter'
import type { MojoAdapterOptions } from './adapter'

export interface MojoBuildOptions extends BuildOptions {
  /** Adapter-specific options passed to MojoAdapter */
  adapterOptions?: MojoAdapterOptions
}

/**
 * Create a BarefootBuildConfig for Mojolicious EP template projects.
 *
 * Uses structural typing — does not import BarefootBuildConfig to avoid a
 * circular dependency between @barefootjs/mojolicious and @barefootjs/cli.
 */
export function createConfig(options: MojoBuildOptions = {}) {
  return {
    adapter: new MojoAdapter(options.adapterOptions),
    paths: options.paths,
    components: options.components,
    outDir: options.outDir,
    minify: options.minify,
    contentHash: options.contentHash,
    clientOnly: options.clientOnly,
    externals: options.externals,
    externalsBasePath: options.externalsBasePath,
    bundleEntries: options.bundleEntries,
    outputLayout: options.outputLayout ?? {
      templates: 'templates',
      clientJs: 'client',
      runtime: 'client',
    },
    postBuild: options.postBuild,
  }
}
