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
 * One `components` entry with per-directory compile behavior. A plain
 * string is exactly equivalent to `{ dir: string }` — see
 * `BarefootViteOptions.components`.
 */
export interface ComponentDirEntry {
  /** Source directory to scan, relative to the Vite root (or absolute). */
  dir: string
  /** `CompileOptions.cssLayerPrefix` for every component under `dir`:
   *  static class strings get `layer-{value}:` prefixes so a library's
   *  base classes land in a lower cascade layer than app overrides. Set
   *  it on library entries, leave it off app entries. */
  cssLayerPrefix?: string
  /** Directory NAMES to skip anywhere under `dir` (e.g. `['shared']`). */
  skipDirs?: string[]
}

/**
 * Public options for the `barefoot()` Vite plugin. Exactly three
 * BarefootJS-specific FIELDS — everything else (bundling, hashing,
 * chunking, tree-shaking, minification, dev server, `base`, `outDir`) is
 * stock Vite config. Do not add more fields here; see the design doc for
 * the full list of options this deliberately drops in favor of Vite's own
 * equivalents (`minify` → `build.minify`, `externals` → Rollup's automatic
 * chunk splitting, `clientJsBasePath`/`barefootJsPath` → `base` + manifest
 * resolution, etc).
 *
 * The cap is on FIELDS, not on per-directory expressiveness: whether a
 * directory's classes need a CSS cascade layer, or which subdirectories to
 * skip, is a function of WHICH `components` entry a file came from — so
 * that behavior rides on the `components` entries themselves
 * (`ComponentDirEntry`) rather than becoming a 4th/5th top-level option.
 */
export interface BarefootViteOptions {
  /** A constructed `TemplateAdapter` instance (e.g. `new
   * GoTemplateAdapter({ packageName: 'main' })`). Not a factory function —
   * the plugin never constructs adapters itself. */
  adapter: TemplateAdapter
  /** Source directories to scan for `.tsx` components, relative to the
   * Vite project root (or absolute). A plain string is exactly equivalent
   * to `{ dir: string }` (a `ComponentDirEntry` with no `cssLayerPrefix`/
   * `skipDirs`) — use the object form only when a directory needs one of
   * those. Entries are processed in array order, and that order is also
   * the precedence when the same file is reachable under more than one
   * entry: the first entry wins. */
  components: (string | ComponentDirEntry)[]
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

/**
 * Shape exposed on the returned plugin's `.api` — Vite's own convention
 * (a plugin may attach an `api` property "designed for other plugins or
 * Vite-based tools to access") for exactly this: tooling that wants this
 * plugin's resolved options without re-deriving them from `vite.config.ts`
 * text. The `bf` CLI (`packages/cli/src/context.ts`) is the one consumer
 * today — it uses Vite's own `loadConfigFromFile` to get the resolved
 * config, finds the plugin by name (`PLUGIN_NAME`, exported from
 * `plugin.ts`) in its `plugins` array, and reads `api.options.components`
 * as `sourceDirs`.
 *
 * Populated synchronously the moment `barefoot(options)` is called —
 * `options` needs no Vite lifecycle hook to have already run, deliberately:
 * `loadConfigFromFile` never calls a plugin's hooks (`config`,
 * `configResolved`, ...) at all, it just evaluates `vite.config.ts` and
 * returns the resulting plugin instances, so anything gated behind
 * `configResolved` (e.g. the plugin's own resolved absolute `componentDirs`)
 * would never be visible to a caller going through that path.
 */
export interface BarefootPluginApi {
  /** The exact options object `barefoot()` was constructed with. */
  options: BarefootViteOptions
}
