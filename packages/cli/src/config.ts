// Build config types for barefoot.config.ts

import type { TemplateAdapter, BuildOptions, BarefootPaths } from '@barefootjs/jsx'

export type { BarefootPaths } from '@barefootjs/jsx'

/** Default paths layout used when `paths` is omitted from barefoot.config.ts. */
export const DEFAULT_PATHS: BarefootPaths = {
  components: 'components/ui',
  tokens: 'tokens',
  meta: 'meta',
}

export interface BarefootBuildConfig extends BuildOptions {
  /** Adapter instance (e.g. HonoAdapter, GoTemplateAdapter) */
  adapter: TemplateAdapter
  /** Adapter-specific post-processing hook for marked templates */
  transformMarkedTemplate?: (content: string, componentId: string, clientJsPath: string) => string
}

/**
 * Identity function for type-checking barefoot.config.ts files.
 */
export function defineConfig(config: BarefootBuildConfig): BarefootBuildConfig {
  return config
}
