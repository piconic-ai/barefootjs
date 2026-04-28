/**
 * JSX-Based Conformance Test Runner
 *
 * Compiles JSX source with adapters and compares rendered HTML output.
 * Each adapter provides its own render function.
 */

import { describe, test, expect } from 'bun:test'
import type { TemplateAdapter } from '@barefootjs/jsx'
import { jsxFixtures } from '../fixtures'

export interface RenderOptions {
  /** JSX source code */
  source: string
  /** Template adapter to use */
  adapter: TemplateAdapter
  /** Props to inject (optional) */
  props?: Record<string, unknown>
  /** Additional component files (filename → source) */
  components?: Record<string, string>
}

export interface RunJSXConformanceOptions {
  /** Factory to create the adapter under test */
  createAdapter: () => TemplateAdapter
  /** Render compiled template to HTML */
  render: (options: RenderOptions) => Promise<string>
  /** Factory to create the reference adapter (optional). If provided, HTML output is compared. */
  referenceAdapter?: () => TemplateAdapter
  /** Render function for reference adapter (required if referenceAdapter is set) */
  referenceRender?: (options: RenderOptions) => Promise<string>
  /** Fixture IDs to skip */
  skip?: string[]
  /** Optional error handler for render failures. Return true to skip the test. */
  onRenderError?: (err: Error, fixtureId: string) => boolean
}

/** HTML void elements that must not have a closing tag */
const VOID_ELEMENTS = 'area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr'

/**
 * Normalize rendered HTML for cross-adapter comparison.
 * Handles known formatting differences between adapters:
 * - Whitespace collapsing (template engine formatting)
 * - bf-p attribute removal (adapter-specific props serialization strategy)
 * - Void element self-closing normalization (<br/> vs <br>)
 * - Trailing whitespace before closing > in tags
 */
export function normalizeHTML(html: string): string {
  return html
    // Remove loop boundary comment markers (template detail, not semantic).
    // Matches both legacy unscoped (`<!--bf-loop-->`) and scoped per-call-site
    // (`<!--bf-loop:l7-->`) forms (#1087). The marker id is `l\d+` — kept
    // explicit so unrelated comments matching a looser pattern aren't stripped.
    .replace(/<!--bf-\/?loop(?::l\d+)?-->/g, '')
    // Remove bf-p attribute (Hono uses JSON serialization, Go uses struct fields)
    .replace(/\s*bf-p="[^"]*"/g, '')
    // Normalize child scope ID prefix: bf-s="~parentId_sN" → bf-s="parentId_sN"
    .replace(/bf-s="~([^"]*)"/g, 'bf-s="$1"')
    // Normalize non-deterministic child scope IDs (hash derived from file path):
    // bf-s="ComponentName_abc123" → bf-s="ComponentName_*"
    .replace(/bf-s="([A-Z][a-zA-Z]*)_[a-z0-9]+"/g, 'bf-s="$1_*"')
    // Normalize void element self-closing: <br/> or <br /> → <br>
    .replace(new RegExp(`<(${VOID_ELEMENTS})(\\s[^>]*?)?\\s*/>`, 'g'), '<$1$2>')
    // Remove trailing whitespace before >
    .replace(/\s+>/g, '>')
    // Collapse inter-tag whitespace (Go Template adds newlines between blocks)
    .replace(/>\s+</g, '><')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

export function runJSXConformanceTests(options: RunJSXConformanceOptions): void {
  const { createAdapter, render, referenceAdapter, referenceRender, skip = [] } = options
  const skipSet = new Set(skip)

  describe('JSX Conformance Tests', () => {
    for (const fixture of jsxFixtures) {
      if (skipSet.has(fixture.id)) continue

      test(`[${fixture.id}] ${fixture.description}`, async () => {
        const adapter = createAdapter()

        // 1. Render with the adapter under test
        let html: string
        try {
          html = await render({
            source: fixture.source,
            adapter,
            props: fixture.props,
            components: fixture.components,
          })
        } catch (err) {
          if (options.onRenderError?.(err as Error, fixture.id)) return
          throw err
        }
        expect(html).toBeTruthy()

        // 2. Compare HTML output against reference
        if (referenceAdapter && referenceRender) {
          // Live reference: render with reference adapter and compare
          const refAdapter = referenceAdapter()
          const refHtml = await referenceRender({
            source: fixture.source,
            adapter: refAdapter,
            props: fixture.props,
            components: fixture.components,
          })

          const normalizedHtml = normalizeHTML(html)
          const normalizedRefHtml = normalizeHTML(refHtml)

          expect(normalizedHtml).toBe(normalizedRefHtml)
        } else if (fixture.expectedHtml) {
          // Pre-generated reference: compare against fixture's expectedHtml
          const normalizedHtml = normalizeHTML(html)
          expect(normalizedHtml).toBe(fixture.expectedHtml)
        }
      })
    }
  })
}
