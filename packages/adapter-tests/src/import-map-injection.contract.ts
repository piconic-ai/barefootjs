// Cross-adapter importmap-injection contract.
//
// When an application supplies an externals manifest (the importmap +
// modulepreload manifest, see `ExternalsManifest`), every adapter must give
// the application author a way to inject that manifest into the page <head>
// — otherwise configured externals 404 on their bare specifiers (issues
// #1639 / #1644). Adapters satisfy this two ways:
//
//   - 'component'    — a render-time component (Hono's `BfImportMap`) renders
//                      whatever manifest the app passes it; no static
//                      snippet file is involved.
//   - 'html-snippet' — a template-string target (Go html/template, Mojolicious
//                      EP) has no component layer, so the app renders its
//                      manifest to a static `barefoot-importmap.html`
//                      snippet itself (via `renderImportMapHtml`).
//
// The contract is adapter-agnostic: a new adapter satisfies it by computing the
// facts below from its own machinery and passing them to
// `assertImportMapInjectionContract`. The facts type avoids adapter-specific
// terminology so adding an adapter does not change the contract surface — and a
// new adapter that ships without an injection point fails the contract instead
// of silently leaving externals unresolvable.

import { expect } from 'bun:test'

export interface ImportMapInjectionFacts {
  /** Adapter name, surfaced in failure messages. */
  adapterName: string
  /**
   * The adapter's declared injection strategy (`TemplateAdapter.importMapInjection`).
   * Must be set — a missing strategy means a configured `externals` has nowhere
   * to inject.
   */
  strategy: 'component' | 'html-snippet' | undefined
  /**
   * The actual importmap markup this adapter injects for a sample manifest:
   *   - 'component' adapters: the rendered output of the adapter's component
   *     (e.g. `String(BfImportMap({ base, externals: manifest }))`).
   *   - 'html-snippet' adapters: the static snippet the app would render
   *     (i.e. `renderImportMapHtml(manifest)`).
   * The contract checks it carries a usable importmap.
   */
  renderedImportMap: string
  /**
   * The URL a sample external (e.g. `zod`) resolves to in the manifest. The
   * contract requires this to appear as a *value inside the importmap's
   * `imports`* — not merely somewhere in the markup — proving the adapter
   * actually consumes the manifest rather than hardcoding only the
   * `@barefootjs/client*` defaults (the regression behind #1639). Pass a URL
   * that the sample manifest also lists in `preloads` so the `crossorigin`
   * parity check below is exercised too.
   */
  externalSpecifier: string
}

/** Extract the parsed `imports` object from a `<script type="importmap">`. */
function parseImportMap(markup: string): Record<string, string> {
  const match = markup.match(/<script type="importmap">(.*?)<\/script>/s)
  if (!match) throw new Error('no <script type="importmap"> in injected markup')
  return JSON.parse(match[1]).imports ?? {}
}

/**
 * Assert that an adapter satisfies the importmap-injection contract. Call from
 * a per-adapter (or the shared) test after extracting the facts from that
 * adapter's machinery.
 *
 * Beyond presence checks, this asserts the parity properties that keep the
 * component path (Hono's `BfImportMap`) and the html-snippet path
 * (`renderImportMapHtml`) from drifting: the external must resolve *through
 * the importmap*, and every `modulepreload` hint must carry `crossorigin`
 * (#1648). A weaker "substring somewhere in the markup" check let both the
 * #1648 omission and an empty-importmap-with-matching-preload slip through.
 */
export function assertImportMapInjectionContract(facts: ImportMapInjectionFacts): void {
  expect(
    facts.strategy === 'component' || facts.strategy === 'html-snippet',
    `${facts.adapterName}: importMapInjection must be 'component' or 'html-snippet', got ${String(facts.strategy)}`,
  ).toBe(true)

  expect(
    facts.renderedImportMap.includes('<script type="importmap">'),
    `${facts.adapterName}: injected markup is missing <script type="importmap">`,
  ).toBe(true)

  // The external must be resolved BY the importmap (a value in `imports`),
  // not just present anywhere in the markup (e.g. only in a preload <link>).
  const importValues = Object.values(parseImportMap(facts.renderedImportMap))
  expect(
    importValues.includes(facts.externalSpecifier),
    `${facts.adapterName}: importmap does not resolve external "${facts.externalSpecifier}" — the manifest is being ignored (#1639)`,
  ).toBe(true)

  // Every modulepreload hint must carry `crossorigin` so cross-origin (CDN)
  // preloads match the actual CORS module fetch and are not discarded (#1648).
  const preloadLinks = facts.renderedImportMap.match(/<link\b[^>]*\brel="modulepreload"[^>]*>/g) ?? []
  for (const link of preloadLinks) {
    expect(
      /\bcrossorigin\b/.test(link),
      `${facts.adapterName}: modulepreload hint missing crossorigin (#1648): ${link}`,
    ).toBe(true)
  }
}
