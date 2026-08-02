import type { TemplateAdapter } from '@barefootjs/jsx'

/**
 * Public options for the `barefoot()` Vite plugin. Exactly three
 * BarefootJS-specific fields — everything else (bundling, hashing,
 * chunking, tree-shaking, minification, dev server, `base`, `outDir`) is
 * stock Vite config. Do not add more fields here; see the design doc for
 * the full list of options this deliberately drops in favor of Vite's own
 * equivalents (`minify` → `build.minify`, `externals` → Rollup's automatic
 * chunk splitting, `clientJsBasePath`/`barefootJsPath` → `base` + manifest
 * resolution, etc).
 */
export interface BarefootViteOptions {
  /** A constructed `TemplateAdapter` instance (e.g. `new
   * GoTemplateAdapter({ packageName: 'main' })`). Not a factory function —
   * the plugin never constructs adapters itself. */
  adapter: TemplateAdapter
  /** Source directories to scan for `.tsx` components, relative to the
   * Vite project root (or absolute). */
  components: string[]
  /** Where compiled templates, `ssrDefaults`, and adapter-generated types
   * land — relative to the Vite project root (or absolute). This is a
   * backend source directory the server-side app reads, NOT
   * `build.outDir` (which is Vite's client-asset output). */
  templates: string
}
