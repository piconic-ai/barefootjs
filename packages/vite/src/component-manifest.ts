/**
 * Reassembles ONE source file's row for the combined `manifest.json` this
 * plugin writes to `templatesDir` alongside the per-component
 * `<Name>.ssr-defaults.json` files `emit.ts`'s `planEmits` already produces.
 *
 * WHY THIS EXISTS (not just the per-component files): every PHP/Python/Ruby
 * backend driving a `templatesPerComponent` adapter (Blade/Jinja2/ERB) reads
 * `ssrDefaults` — an optional-prop-derived signal's SSR seed value — from
 * disk at REQUEST time (there is no compile step to bake it into source the
 * way Go's generated `NewXxxProps` constructor or Hono's self-contained
 * `.tsx` file can). Combining every source file's row into one manifest
 * means each backend reads a single file instead of glob-and-reassembling
 * the identical `{ [component]: { ssrDefaults } }` shape itself — avoiding
 * seven copies of the same reconstruction logic across three languages,
 * each of which could drift or break independently. One place in core
 * beats three `/vite` packages reimplementing it, and
 * `@barefootjs/go-template/vite` / `@barefootjs/hono/vite` get the same
 * manifest for free even though neither adapter's own backend currently
 * reads it (Go bakes `ssrDefaults` into generated source; Hono's `.tsx`
 * inlines them as JS defaults) — see this module's own callers for the
 * confirmation that neither reads a manifest today.
 *
 * Implemented standalone rather than by importing from `@barefootjs/cli`,
 * for the same reason as `paths.ts`'s header comment: that package's only
 * published entry point is the full `bf` binary.
 *
 * Two fields are deliberately NOT part of `ManifestEntry`:
 *
 * - `stubDeps` is not emitted: Rollup's own module graph resolution
 *   handles dependency wiring, so there is no separate stub-dependency
 *   bookkeeping to produce, and no consumer reads such a field.
 * - `clientJs` is not emitted: there is no single static path to put
 *   there. The real client JS URL is content-hashed and mode-dependent
 *   (dev-origin vs. build-manifest-resolved) — exactly what
 *   `scriptAssets` already resolves and bakes directly into the compiled
 *   template's own script-registration call, so no backend reads
 *   `manifest[name].clientJs` (grep the PHP/Python/Ruby runtimes: zero
 *   hits), and a static value there would be actively misleading.
 */
import type { CompileResult, TemplateAdapter } from '@barefootjs/jsx'
import { perComponentRelPath, relativeUnderComponentDir, withExtension } from './paths.ts'

/** One exported component's row inside a multi-export source file's
 * `components` map (`templatesPerComponent` adapters only). */
export interface ManifestComponentEntry {
  markedTemplate: string
  ssrDefaults?: Record<string, unknown>
}

/** One SOURCE FILE's row in the combined manifest (see this module's
 * header for the fields intentionally not included). */
export interface ManifestEntry {
  markedTemplate: string
  ssrDefaults?: Record<string, unknown>
  /** Per-exported-component rows for `templatesPerComponent` adapters
   * (piconic-ai/barefootjs#2132) — present even for a single-component
   * file. */
  components?: Record<string, ManifestComponentEntry>
}

/**
 * Builds one source file's `{ manifestKey, entry }` pair from its
 * already-compiled `CompileResult`. Returns `null` when the compile
 * produced no `markedTemplate` at all (nothing to register).
 */
export function buildManifestEntry(
  result: CompileResult,
  absPath: string,
  componentDirs: readonly string[],
  adapter: TemplateAdapter,
): { manifestKey: string; entry: ManifestEntry } | null {
  const markedTemplates = result.files.filter(f => f.type === 'markedTemplate')
  if (markedTemplates.length === 0) return null

  const relUnderComponentDir = relativeUnderComponentDir(absPath, componentDirs)
  // Source file's path relative to its `components` dir, extension
  // stripped (e.g. `Counter`, or `ui/toast/index` for a multi-export
  // file). `relativeUnderComponentDir` gives the position under whichever
  // configured `componentDirs` entry contains it, still WITH the
  // extension; `withExtension(..., '')` strips it.
  const manifestKey = withExtension(relUnderComponentDir, '')

  const ssrDefaultsByComponent = new Map<string, Record<string, unknown>>()
  for (const f of result.files) {
    if (f.type !== 'ssrDefaults' || !f.componentName) continue
    try {
      ssrDefaultsByComponent.set(f.componentName, JSON.parse(f.content) as Record<string, unknown>)
    } catch {
      // Malformed ssrDefaults content is dropped silently rather than
      // failing the build.
    }
  }

  // Every `markedTemplate`/`ssrDefaults` FileOutput is unconditionally
  // stamped with `componentName` (see `packages/jsx/src/compiler.ts`,
  // both the single- and multi-component-per-file code paths) — pairing on
  // it directly is exact and adapter-agnostic, with no filename-based
  // heuristic needed.
  const relPathFor = (componentName: string | undefined): string =>
    adapter.templatesPerComponent && componentName
      ? perComponentRelPath(relUnderComponentDir, componentName, adapter.extension)
      : withExtension(relUnderComponentDir, adapter.extension)

  let componentsMap: Record<string, ManifestComponentEntry> | undefined
  if (adapter.templatesPerComponent) {
    componentsMap = {}
    for (const tpl of markedTemplates) {
      if (!tpl.componentName) continue
      const ssrDefaults = ssrDefaultsByComponent.get(tpl.componentName)
      componentsMap[tpl.componentName] = {
        markedTemplate: relPathFor(tpl.componentName),
        ...(ssrDefaults ? { ssrDefaults } : {}),
      }
    }
    if (Object.keys(componentsMap).length === 0) componentsMap = undefined
  }

  // Primary (top-level) template is `markedTemplates[0]`. For a
  // `templatesPerComponent` adapter this is the sole/first component —
  // the source file's own basename in every real component in this repo
  // (`Counter.tsx` exports `Counter`), or, for a multi-export file where
  // no per-component name equals the file's own basename (e.g.
  // `ui/toast/index.tsx`), simply the first exported component. For a
  // combined-file adapter there is only ever one entry, so the same
  // index works unconditionally.
  const primary = markedTemplates[0]!
  const primarySsrDefaults = primary.componentName ? ssrDefaultsByComponent.get(primary.componentName) : undefined

  const entry: ManifestEntry = {
    markedTemplate: relPathFor(primary.componentName),
    ...(primarySsrDefaults ? { ssrDefaults: primarySsrDefaults } : {}),
    ...(componentsMap ? { components: componentsMap } : {}),
  }

  return { manifestKey, entry }
}
