/**
 * Shared importmap-snippet renderer.
 *
 * Renders an "externals manifest" (see `ExternalsManifest` below) into the
 * `<script type="importmap">` (plus `<link rel="modulepreload">`) HTML for
 * mapping bare specifiers — e.g. a component's `import { z } from 'zod'` —
 * to browser-resolvable URLs. Component adapters (Hono) read a manifest at
 * render time via a JSX component (`BfImportMap`); template-string adapters
 * (Go html/template, Mojolicious EP) have no component layer, so they render
 * a static HTML snippet from the same manifest to `{{ template }}` /
 * `%= include` into the page `<head>` instead.
 *
 * This module is the single source of truth for that snippet's HTML, so every
 * adapter's importmap injection point stays in sync. See issue #1644.
 */

/**
 * The manifest shape needed to render the importmap snippet. All fields are
 * optional so a partial or hand-written manifest (e.g. a Hono `BfImportMap`
 * `externals` prop) still type-checks. The all-required `ExternalsManifest`
 * is structurally assignable to this, so both feed `renderImportMapHtml`.
 * This is the one shared manifest type for every importmap injection path.
 */
export interface ImportMapManifest {
  /** Entries for `<script type="importmap">`. */
  importmap?: { imports?: Record<string, string> }
  /** URLs to emit as `<link rel="modulepreload">`. */
  preloads?: string[]
}

/**
 * The all-required superset of {@link ImportMapManifest} — the shape a
 * caller assembles when it has resolved every field itself (as opposed to a
 * partial, hand-written one). Nothing in this tree currently produces this
 * manifest for the app automatically; an app wiring up externals under
 * `@barefootjs/vite` builds one and passes it to `BfImportMap` /
 * `renderImportMapHtml` itself.
 */
export interface ExternalsManifest {
  /** Entries for `<script type="importmap">`. */
  importmap: { imports: Record<string, string> }
  /** URLs to emit as `<link rel="modulepreload">`. */
  preloads: string[]
  /** Package names to pass as `--external` to the user's bundler. */
  externals: string[]
}

/** Escape a value for use inside a double-quoted HTML attribute. */
function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * Render the `<script type="importmap">` (plus `<link rel="modulepreload">`)
 * snippet from a parsed externals manifest. Fields are read defensively so a
 * partial or hand-written manifest still produces valid output.
 *
 * Inside the importmap JSON, each `<` is replaced with its JSON unicode escape
 * for code point U+003C so a URL containing `</script>` cannot break out of the
 * script element — the JSON parser decodes that escape back to `<`, keeping the
 * mapping value-identical.
 */
export function renderImportMapHtml(manifest: ImportMapManifest): string {
  const imports = manifest.importmap?.imports ?? {}
  const json = JSON.stringify({ imports }).replace(/</g, '\\u003c')
  const lines = [`<script type="importmap">${json}</script>`]
  for (const href of manifest.preloads ?? []) {
    // `crossorigin` is required so a cross-origin (CDN) preload's request
    // matches the actual module `import` (always a CORS fetch); without it
    // the browser discards the preload and re-fetches. Harmless for
    // same-origin preloads, which use the same credentials mode either way.
    // See issue #1648.
    lines.push(`<link rel="modulepreload" href="${escapeHtmlAttr(href)}" crossorigin>`)
  }
  return lines.join('\n') + '\n'
}
