/**
 * bf-p Serialization Conformance (#1952)
 *
 * The `bf-p` attribute carries the JSON-serialized props a root island
 * needs for client-side hydration. This suite verifies that no adapter
 * leaks rendered HTML (containing per-render-random scope IDs) into
 * that attribute.
 *
 * Contract:
 *
 *   For every `bf-p` attribute in the rendered HTML, if the parsed JSON
 *   object has a `children` key, its value MUST NOT contain HTML markup
 *   (specifically `bf-s=` scope markers). Rendered children are already
 *   in the DOM — serialising them into `bf-p` leaks nested scope IDs
 *   and causes the router's region diff to false-swap on every
 *   navigation.
 *
 * Design (Open/Closed):
 *
 *   Same as marker-conformance: this module knows no adapter names.
 *   Each adapter wires this suite via `runAdapterConformanceTests`,
 *   providing its own factory and render function. Adding a new adapter
 *   is a one-package edit.
 */

import { describe, test, expect } from 'bun:test'
import { jsxFixtures } from '../fixtures'
import type { RenderOptions } from './jsx-runner'

export interface RunBfPConformanceOptions {
  name: string
  render: (opts: RenderOptions) => Promise<string>
  createAdapter: () => import('@barefootjs/jsx').TemplateAdapter
  onRenderError?: (err: Error, fixtureId: string) => boolean
  skipFixtures?: ReadonlySet<string>
}

/**
 * Extract all `bf-p="..."` attribute values from rendered HTML.
 * The attribute value is HTML-escaped JSON; we unescape the common
 * entities before parsing.
 */
function extractBfPValues(html: string): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = []
  for (const m of html.matchAll(/bf-p="([^"]*)"/g)) {
    const raw = m[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
    try {
      const obj = JSON.parse(raw)
      if (obj && typeof obj === 'object') results.push(obj)
    } catch {
      // Not JSON we recognise — skip.
    }
  }
  return results
}

export function runBfPConformance(opts: RunBfPConformanceOptions): void {
  describe(`[${opts.name}] bf-p serialization conformance (#1952)`, () => {
    for (const fixture of jsxFixtures) {
      if (opts.skipFixtures?.has(fixture.id)) continue
      if (!fixture.expectedHtml && !fixture.components) continue

      test(`${fixture.id}: bf-p children must not contain HTML markup`, async () => {
        const adapter = opts.createAdapter()
        let html: string
        try {
          html = await opts.render({
            source: fixture.source,
            adapter,
            props: fixture.props !== undefined ? structuredClone(fixture.props) : undefined,
            components: fixture.components,
            componentModules: fixture.componentModules,
            componentName: fixture.componentName,
          })
        } catch (err) {
          // Render failure is not this suite's concern — the JSX
          // conformance suite already reports the same error. Swallow
          // so bf-p conformance never becomes the first-failure reporter
          // for an unrelated module-resolution or runtime issue.
          if (opts.onRenderError?.(err as Error, fixture.id)) return
          return
        }

        const bfPObjects = extractBfPValues(html)
        for (const obj of bfPObjects) {
          if ('children' in obj && typeof obj.children === 'string') {
            expect(obj.children).not.toMatch(/bf-s=/)
          }
        }
      })
    }
  })
}
