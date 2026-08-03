import type { TemplateAdapter } from '@barefootjs/jsx'

/**
 * Narrow context handed to `afterEmit` once per eager pass (`writeBundle`
 * for `vite build`, the dev pass for `vite dev`) — AFTER every discovered
 * component's template has already been written to `templatesDir`. This is
 * the one escape hatch this plugin exposes, and its shape is deliberately
 * minimal:
 *
 * - `types`: adapter-generated `types` fragments (e.g. Go Props structs)
 *   this pass produced, keyed by the source file's absolute path. Raw,
 *   per-file, uncombined — combining them into a single backend-native
 *   file (stripping headers, deduping, injecting shared helpers) is a
 *   real per-language operation an adapter's own `/vite` subpath performs
 *   (see `@barefootjs/go-template/vite`'s use of `combineGoTypes`), not
 *   something core knows how to do generically.
 * - `projectDir` / `templatesDir` / `outDir`: the same absolute paths the
 *   plugin itself just used to write templates and (for `outDir`) that
 *   Vite wrote client assets to.
 * - `mode`: which eager pass just ran. Go's `components.go` (and any other
 *   adapter-side derived file) has to exist for `go run .` to even compile
 *   in dev, which is why this fires from BOTH passes, not just the build
 *   one — a hook named `postBuild` would misleadingly suggest otherwise.
 *
 * What this deliberately does NOT carry: emitted client JS. That's the
 * one thing a caller must never be handed to rewrite post-compile (see
 * CLAUDE.md's "never add compiler options/hooks for tool-specific output
 * rewriting") — closing that door by TYPE, not by convention, is the
 * point of keeping this context this narrow.
 */
export interface AfterEmitContext {
  /** Per-source-file `types` output, keyed by that file's absolute path.
   * Empty when no discovered file in this pass produced a `types` output. */
  types: Map<string, string>
  /** Absolute path to the Vite project root. */
  projectDir: string
  /** Absolute path to the configured `templates` output dir. */
  templatesDir: string
  /** Absolute path to Vite's configured `build.outDir`. */
  outDir: string
  /** Which eager pass just ran. */
  mode: 'build' | 'dev'
}

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
  /**
   * Where compiled templates, `ssrDefaults`, and adapter-generated types
   * land — relative to the Vite project root (or absolute). This is a
   * backend source directory the server-side app reads, NOT
   * `build.outDir` (which is Vite's client-asset output).
   *
   * Optional for an adapter whose `generate()` output is ALWAYS empty
   * (e.g. `CSRAdapter` — CSR has no template-language backend to point a
   * `templates` dir at). When omitted, the eager pass still compiles every
   * discovered component (client JS generation is unaffected) but writes
   * nothing to disk on its behalf — no per-component template/ssrDefaults/
   * types files, no `manifest.json`. If some discovered component turns
   * out to produce a REAL (non-empty) template anyway, the eager pass
   * refuses loudly instead of silently dropping it: omitting `templates`
   * is a claim about the adapter's output that this plugin verifies rather
   * than trusts. See `plugin.ts`'s `assertNoRealTemplateOutput`.
   */
  templates?: string
  /**
   * Optional escape hatch called once per eager pass (build AND dev), after
   * templates are written, with a narrow `AfterEmitContext`. NOT a
   * user-facing 4th option in the design-doc sense — it exists so an
   * adapter's own `/vite` subpath (e.g. `@barefootjs/go-template/vite`) can
   * wire up its own per-language post-processing (e.g. combining `types`
   * into a single `components.go`) while calling this core plugin
   * underneath. See `AfterEmitContext`'s docstring for what it can and
   * cannot see.
   */
  afterEmit?: (ctx: AfterEmitContext) => Promise<void> | void
}
