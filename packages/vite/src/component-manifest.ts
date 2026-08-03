/**
 * Reassembles ONE source file's row for the combined `manifest.json` this
 * plugin writes to `templatesDir` alongside the per-component
 * `<Name>.ssr-defaults.json` files `emit.ts`'s `planEmits` already produces
 * — matching `packages/cli/src/lib/build-cache.ts`'s `ManifestEntry` /
 * `ManifestComponentEntry` shape and `packages/cli/src/lib/build.ts`'s
 * manifest-building block (search that file for `manifestKey = baseNameNoExt`)
 * EXACTLY, verified by reading both, not inferred from any consumer.
 *
 * WHY THIS EXISTS (not just the per-component files): every PHP/Python/Ruby
 * backend driving a `templatesPerComponent` adapter (Blade/Jinja2/ERB) reads
 * `ssrDefaults` — an optional-prop-derived signal's SSR seed value — from
 * disk at REQUEST time (there is no compile step to bake it into source the
 * way Go's generated `NewXxxProps` constructor or Hono's self-contained
 * `.tsx` file can). The legacy CLI wrote that as one combined
 * `dist/templates/manifest.json`; without this, every one of those backends
 * would have to glob-and-reassemble the identical `{ [component]: {
 * ssrDefaults } }` shape from the per-component files themselves — seven
 * copies of the same reconstruction logic across three languages, and a
 * capability the pipeline used to just hand over silently regressing the
 * moment nobody's looking (stack 7 deletes the legacy CLI entirely). One
 * place in core beats three `/vite` packages reimplementing it, and
 * `@barefootjs/go-template/vite` / `@barefootjs/hono/vite` get the same
 * manifest for free even though neither adapter's own backend currently
 * reads it (Go bakes `ssrDefaults` into generated source; Hono's `.tsx`
 * inlines them as JS defaults) — see this module's own callers for the
 * confirmation that neither reads a manifest today.
 *
 * Ported (not imported) from `@barefootjs/cli`'s types, per this package's
 * existing precedent — see `paths.ts`'s header comment: `@barefootjs/cli`'s
 * only published entry point pulls in its whole esbuild-based build
 * pipeline as an import side effect, which this plugin exists to replace.
 *
 * Two legacy `ManifestEntry` fields are intentionally NOT reproduced:
 *
 * - `stubDeps` — bookkeeping for the legacy CLI's esbuild-based stub-
 *   dependency resolution (`resolveRelativeImports`). Rollup's own module
 *   graph resolution makes the concept moot; no consumer reads it.
 * - `clientJs` — the legacy CLI wrote a STATIC (non-hashed) relative path
 *   because it controlled the client JS output location directly. Under
 *   Vite the real URL is content-hashed and mode-dependent (dev-origin vs.
 *   build-manifest-resolved) — exactly what `scriptAssets` already resolves
 *   and bakes directly into the compiled template's own script-registration
 *   call, so no backend has ever read `manifest[name].clientJs` (grep the
 *   PHP/Python/Ruby runtimes: zero hits) and there is no single static path
 *   left to put there that wouldn't be actively misleading.
 */
import type { CompileResult, TemplateAdapter } from '@barefootjs/jsx'
import { perComponentRelPath, relativeUnderComponentDir, withExtension } from './paths.ts'

/** One exported component's row inside a multi-export source file's
 * `components` map (`templatesPerComponent` adapters only) — matches
 * `@barefootjs/cli`'s `ManifestComponentEntry`. */
export interface ManifestComponentEntry {
  markedTemplate: string
  ssrDefaults?: Record<string, unknown>
}

/** One SOURCE FILE's row in the combined manifest — matches
 * `@barefootjs/cli`'s `ManifestEntry` (minus `stubDeps`/`clientJs`; see this
 * module's header). */
export interface ManifestEntry {
  markedTemplate: string
  ssrDefaults?: Record<string, unknown>
  /** Per-exported-component rows for `templatesPerComponent` adapters
   * (piconic-ai/barefootjs#2132) — present even for a single-component file,
   * matching the legacy CLI's own unconditional-when-`templatesPerComponent`
   * behavior. */
  components?: Record<string, ManifestComponentEntry>
}

/**
 * Builds one source file's `{ manifestKey, entry }` pair from its
 * already-compiled `CompileResult`. Returns `null` when the compile
 * produced no `markedTemplate` at all (nothing to register) — mirrors the
 * legacy CLI's own `markedTemplates.length > 0` guard.
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
  // file) — matches the legacy CLI's `effectiveNamesFor`'s `baseNameNoExt`
  // (this plugin's `relativeUnderComponentDir` is the SAME "position under
  // whichever configured componentDirs entry contains it" computation,
  // just WITH the extension still on; `withExtension(..., '')` strips it).
  const manifestKey = withExtension(relUnderComponentDir, '')

  const ssrDefaultsByComponent = new Map<string, Record<string, unknown>>()
  for (const f of result.files) {
    if (f.type !== 'ssrDefaults' || !f.componentName) continue
    try {
      ssrDefaultsByComponent.set(f.componentName, JSON.parse(f.content) as Record<string, unknown>)
    } catch {
      // Malformed ssrDefaults content is dropped — matches the legacy
      // CLI's own `try { JSON.parse(...) } catch { return undefined }`.
    }
  }

  // Every `markedTemplate`/`ssrDefaults` FileOutput is unconditionally
  // stamped with `componentName` (see `packages/jsx/src/compiler.ts`,
  // both the single- and multi-component-per-file code paths) — pairing on
  // it directly is exact and adapter-agnostic, unlike the legacy CLI's own
  // path-basename heuristic (`ssrDefaultsForTemplate`), which existed to
  // paper over esbuild's own multi-physical-file output naming and has no
  // equivalent ambiguity here.
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

  // Primary (top-level) template: the legacy CLI picks whichever template's
  // OWN output filename starts with the source file's basename — a
  // heuristic that, for a `templatesPerComponent` adapter, only matches
  // when the sole/first component's name equals the source file's own
  // basename (the case every real component in this repo hits: `Counter.tsx`
  // exports `Counter`) and falls through to `markedTemplates[0]` for every
  // other case (a multi-export file, where NO per-component name equals the
  // file's own basename, e.g. `ui/toast/index.tsx`). So `markedTemplates[0]`
  // alone reproduces its result exactly, for both per-component and
  // combined-file adapters, without re-deriving esbuild-era filename
  // conventions this plugin's own output doesn't share.
  const primary = markedTemplates[0]!
  const primarySsrDefaults = primary.componentName ? ssrDefaultsByComponent.get(primary.componentName) : undefined

  const entry: ManifestEntry = {
    markedTemplate: relPathFor(primary.componentName),
    ...(primarySsrDefaults ? { ssrDefaults: primarySsrDefaults } : {}),
    ...(componentsMap ? { components: componentsMap } : {}),
  }

  return { manifestKey, entry }
}
