/**
 * JSX-Based Conformance Test Runner
 *
 * Compiles JSX source with adapters and compares rendered HTML output.
 * Each adapter provides its own render function.
 */

import { describe, test, expect } from 'bun:test'
import type { CompilerError, TemplateAdapter } from '@barefootjs/jsx'
import { compileJSX } from '@barefootjs/jsx'
import { jsxFixtures } from '../fixtures'
import type { ExpectedDiagnostic } from './types'

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
  /**
   * Per-fixture diagnostic expectations for the adapter under test.
   *
   * Keyed by `JSXFixture.id`. When a fixture has an entry here, the
   * runner compiles the fixture, asserts each `{ code, severity }`
   * appears in `ir.errors`, and **skips HTML comparison** for that
   * fixture. Fixtures without an entry render normally.
   *
   * Owned by the adapter test file (not by the fixture) so adding a
   * new adapter doesn't require touching shared fixtures: each adapter
   * declares its own contract for the fixtures it intentionally
   * refuses to lower.
   */
  expectedDiagnostics?: Record<string, ReadonlyArray<ExpectedDiagnostic>>
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
    // Also strips per-item start markers `<!--bf-loop-i-->` emitted for
    // multi-root Fragment loop bodies (#1212).
    .replace(/<!--bf-\/?loop(?::l\d+)?-->|<!--bf-loop-i-->/g, '')
    // Remove bf-p attribute (Hono uses JSON serialization, Go uses struct fields)
    .replace(/\s*bf-p="[^"]*"/g, '')
    // Remove bf-h / bf-m slot-relationship markers. Hono emits them
    // for upsertChild's bf-h + bf-m lookup against the @barefootjs
    // client runtime. Other SSR adapters (Mojo, Go template) don't pair with
    // that runtime and don't emit them, so excluding from cross-adapter
    // conformance keeps the comparison apples-to-apples.
    .replace(/\s*bf-h="[^"]*"/g, '')
    .replace(/\s*bf-m="[^"]*"/g, '')
    // bf-r is the Hono-specific root-of-client-component marker for e2e
    // locator distinction (#1249). Other adapters don't emit it, so strip
    // for cross-adapter conformance comparisons.
    .replace(/\s*bf-r=""/g, '')
    // Strip Hono's scope-init comments (`<!--bf-scope:...-->`). Same
    // motivation as the bf-h / bf-m strips above: only Hono's
    // JS-runtime hydration path uses them, so removing them keeps
    // cross-adapter conformance comparisons apples-to-apples.
    .replace(/<!--bf-scope:[^>]*-->/g, '')
    // Strip the streaming-SSR async-boundary placeholder. Mojo and Go
    // template emit a `<div bf-async="aN">…fallback…</div>` placeholder
    // alongside the resolved children (the placeholder is swapped by a
    // streaming-runtime script when the boundary resolves). Hono uses
    // `<Suspense>` which collapses synchronously for non-Promise
    // children, so it emits only the resolved content. Strip the
    // placeholder for cross-adapter conformance — the resolved
    // children remain on both sides. (#1298)
    .replace(/<div bf-async="[^"]*">[\s\S]*?<\/div>/g, '')
    // Normalize child scope ID prefix: bf-s="~parentId_sN" → bf-s="parentId_sN"
    .replace(/bf-s="~([^"]*)"/g, 'bf-s="$1"')
    // Normalize non-deterministic child scope IDs. Keep the trailing
    // `_sN` slot suffix intact so the SSR-hydration contract test can
    // still pair renderChild('Name', ..., 'sN') with `_sN` in HTML.
    //   bf-s="ComponentName_abc123"          → bf-s="ComponentName_*"
    //   bf-s="ComponentName_abc123_s10"      → bf-s="ComponentName_*_s10"
    //   bf-s="ParentName_xyz_s10"            → bf-s="ParentName_*_s10"
    .replace(/bf-s="([A-Z][a-zA-Z]*)_[a-z0-9]+((?:_s\d+)*)"/g, 'bf-s="$1_*$2"')
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

/**
 * Collapse the conditional-branch hydration marker divergence between
 * adapters into a single canonical shape, on top of `normalizeHTML`.
 *
 *   - Hono:  `<br bf-c="s0">`                                       (attribute on the single root)
 *   - Go:    `<!--bf-cond-start:s0--><br><!--bf-cond-end:s0-->`     (comment pair)
 *
 * The runtime accepts either form; both pin the same slotId. For
 * cross-adapter conformance the canonical comparison shape is "no
 * marker at all" — semantic structure remains intact.
 *
 * Kept separate from `normalizeHTML` so the canonical fixture HTML
 * (generated by `scripts/generate-expected-html.ts` from the Hono
 * reference) still carries the `bf-c="sN"` attributes that the
 * SSR-hydration contract test reads to verify the SSR-side markers
 * line up with client-side `$()` / `$t()` references. (#1266)
 */
export function stripConditionalMarkersForCrossAdapter(html: string): string {
  return html
    .replace(/<!--bf-cond-(start|end):[^>]*-->/g, '')
    .replace(/\s*bf-c="[^"]*"/g, '')
}

/**
 * Compile a fixture (parent source + any child components) through the
 * adapter and collect every `CompilerError`. Used by the
 * `expectedDiagnostics` assertion path so the conformance runner can
 * surface adapter-emitted diagnostics without going through the
 * adapter's `render()` (which typically throws on errors).
 */
function collectFixtureDiagnostics(args: {
  source: string
  components?: Record<string, string>
  adapter: TemplateAdapter
}): CompilerError[] {
  const all: CompilerError[] = []
  if (args.components) {
    for (const [filename, childSource] of Object.entries(args.components)) {
      const r = compileJSX(childSource.trimStart(), filename, {
        adapter: args.adapter,
        outputIR: true,
      })
      all.push(...r.errors)
    }
  }
  const result = compileJSX(args.source.trimStart(), 'component.tsx', {
    adapter: args.adapter,
    outputIR: true,
  })
  all.push(...result.errors)
  return all
}

/**
 * Assert that every expected `{ code, severity }` appears at least once
 * in the actual diagnostics. The match is subset — incidental extra
 * diagnostics don't fail the assertion, but every declared expectation
 * must be present.
 */
function assertExpectedDiagnostics(
  fixtureId: string,
  expected: ReadonlyArray<ExpectedDiagnostic>,
  actual: CompilerError[],
): void {
  for (const want of expected) {
    const hit = actual.some(e => e.code === want.code && e.severity === want.severity)
    if (!hit) {
      const seen = actual
        .map(e => `${e.severity}/${e.code}: ${e.message}`)
        .join('\n  ')
      throw new Error(
        `[${fixtureId}] expected diagnostic ${want.severity}/${want.code} was not emitted.\n` +
          `Diagnostics seen:\n  ${seen || '(none)'}`,
      )
    }
  }
}

export function runJSXConformanceTests(options: RunJSXConformanceOptions): void {
  const { createAdapter, render, referenceAdapter, referenceRender, skip = [], expectedDiagnostics: diagnosticsMap } = options
  const skipSet = new Set(skip)

  describe('JSX Conformance Tests', () => {
    for (const fixture of jsxFixtures) {
      if (skipSet.has(fixture.id)) continue

      test(`[${fixture.id}] ${fixture.description}`, async () => {
        // expectedDiagnostics path: compile-only, no HTML comparison.
        // The adapter test file declares the contract per fixture id
        // (e.g. `static-array-children` → BF103 for this adapter).
        // We assert those diagnostics fired and skip rendering —
        // the adapter would either throw or emit invalid template
        // syntax for these intentionally-refused shapes.
        const expectedDiagnostics = diagnosticsMap?.[fixture.id]
        if (expectedDiagnostics && expectedDiagnostics.length > 0) {
          const adapter = createAdapter()
          const diagnostics = collectFixtureDiagnostics({
            source: fixture.source,
            components: fixture.components,
            adapter,
          })
          assertExpectedDiagnostics(fixture.id, expectedDiagnostics, diagnostics)
          return
        }

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
          // Live reference: render with reference adapter and compare.
          // Strip the conditional-branch marker divergence on both sides
          // so the Hono `bf-c="sN"` attribute and Go comment-pair forms
          // collapse to the same canonical shape (#1266).
          const refAdapter = referenceAdapter()
          const refHtml = await referenceRender({
            source: fixture.source,
            adapter: refAdapter,
            props: fixture.props,
            components: fixture.components,
          })

          const normalizedHtml = stripConditionalMarkersForCrossAdapter(normalizeHTML(html))
          const normalizedRefHtml = stripConditionalMarkersForCrossAdapter(normalizeHTML(refHtml))

          expect(normalizedHtml).toBe(normalizedRefHtml)
        } else if (fixture.expectedHtml) {
          // Pre-generated reference: compare against fixture's expectedHtml.
          // Both sides go through normalizeHTML so cross-adapter marker
          // divergences (bf-c attribute vs comment-pair markers) collapse
          // to a single canonical token before comparison (#1266).
          const normalizedHtml = stripConditionalMarkersForCrossAdapter(normalizeHTML(html))
          const normalizedExpected = stripConditionalMarkersForCrossAdapter(normalizeHTML(fixture.expectedHtml))
          expect(normalizedHtml).toBe(normalizedExpected)
        }
      })
    }
  })
}
