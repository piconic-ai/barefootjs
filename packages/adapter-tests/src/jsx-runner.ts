/**
 * JSX-Based Conformance Test Runner
 *
 * Compiles JSX source with adapters and compares rendered HTML output.
 * Each adapter provides its own render function.
 */

import { describe, test, expect } from 'bun:test'
import type { ComponentIR, CompilerError, TemplateAdapter } from '@barefootjs/jsx'
import { compileJSX } from '@barefootjs/jsx'
import { jsxFixtures } from '../fixtures'
import type { ExpectedDiagnostic } from './types'
import { normalizeHTML, stripConditionalMarkersForCrossAdapter } from './html-normalize'

export interface RenderOptions {
  /** JSX source code */
  source: string
  /** Template adapter to use */
  adapter: TemplateAdapter
  /** Props to inject (optional) */
  props?: Record<string, unknown>
  /** Additional component files (filename → source) */
  components?: Record<string, string>
  /**
   * Pre-compiled child SSR modules (import specifier → absolute module
   * path) — #1467 Phase 2a. Consumed by the Hono render to re-anchor
   * child imports to committed modules; other adapters ignore it.
   */
  componentModules?: Record<string, string>
  /**
   * Explicit component name to render when the source declares multiple
   * exports (e.g. `ReactiveProps.tsx` defines both `ReactiveProps` and
   * `PropsReactivityComparison`). Adapters that consume this MUST fall
   * back to their pre-existing first-export selection when omitted.
   */
  componentName?: string
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

// `normalizeHTML` / `stripConditionalMarkersForCrossAdapter` live in
// `./html-normalize.ts` (#2481) — a pure module with no `bun:test`
// import, so `oracle.playwright.ts` (a Playwright spec, whose worker
// processes run under Node's `worker_threads` and can't resolve the
// `bun:` URL scheme this file's `bun:test` import needs) can use them
// without pulling in the runner glue below. Re-exported here so every
// existing `bun test` consumer's import path is unchanged.
export { normalizeHTML, stripConditionalMarkersForCrossAdapter }

/**
 * Compile a fixture (parent source + any child components) through the
 * adapter and collect every `CompilerError`. Used by the
 * `expectedDiagnostics` assertion path so the conformance runner can
 * surface adapter-emitted diagnostics without going through the
 * adapter's `render()` (which typically throws on errors).
 */
/**
 * Register a child/sibling component's cross-component shape on the adapter
 * when it supports the optional `registerChildComponentShape` hook (Go
 * template — #checkbox). A no-op on adapters without it. Mirrors
 * `test-render.ts`'s identically-named helper: `compileJSX` alone never
 * calls this hook, so a diagnostic that depends on it (a prop routed into
 * a child's rest bag rather than a declared field, #2805) would silently
 * never fire under `collectFixtureDiagnostics`'s compile-only path without
 * this — the exact gap that let `jsx-element-prop-rest-bag-dynamic`'s
 * pinned BF101 go unreproduced in this runner despite reproducing correctly
 * under the real-render harness.
 */
function registerChildShape(adapter: TemplateAdapter, ir: ComponentIR): void {
  const hook = (adapter as { registerChildComponentShape?: (ir: ComponentIR) => void }).registerChildComponentShape
  if (typeof hook === 'function') hook.call(adapter, ir)
}

function collectFixtureDiagnostics(args: {
  source: string
  components?: Record<string, string>
  adapter: TemplateAdapter
}): CompilerError[] {
  const all: CompilerError[] = []
  // Mirrors `bf build`'s real semantics (packages/compat/src/engine.ts): a
  // fixture with sibling `components` compiles them onto one template
  // instance, so cross-template calls from a loop body resolve at render
  // time. Without this, `checkImportedLoopChildComponents` fires BF103 for
  // every adapter even though the shape works in real usage (#2205).
  // Assumes every relative import the fixture's source makes is present in
  // `components` — a fixture that imports a sibling NOT provided there
  // would have its legitimate BF103 suppressed here too, surfacing instead
  // as a murkier render-time "missing template" error. Such a fixture is
  // broken by construction regardless, so this isn't gated further.
  const siblingTemplatesRegistered = Boolean(args.components)
  if (args.components) {
    for (const [filename, childSource] of Object.entries(args.components)) {
      const r = compileJSX(childSource.trimStart(), filename, {
        adapter: args.adapter,
        outputIR: true,
        siblingTemplatesRegistered,
      })
      all.push(...r.errors)
      // Register every child's shape before the parent compiles below —
      // same ordering `test-render.ts` uses, and for the same reason (a
      // child that itself renders a sibling needs every shape registered
      // first, though this diagnostics-only path never reaches that
      // two-hop case in practice).
      for (const irFile of r.files.filter(f => f.type === 'ir')) {
        registerChildShape(args.adapter, JSON.parse(irFile.content) as ComponentIR)
      }
    }
  }
  const result = compileJSX(args.source.trimStart(), 'component.tsx', {
    adapter: args.adapter,
    outputIR: true,
    siblingTemplatesRegistered,
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

        // 1. Render with the adapter under test.
        //
        // `structuredClone` isolates the prop object per render so a
        // mutating method in the fixture's source (e.g. `.reverse()`,
        // `.sort()`) can't poison subsequent renders against the same
        // fixture object — same fixture instance is shared by the
        // reference render below and by csr-conformance, so without
        // the clone the second run sees an already-mutated array.
        // CI didn't catch this previously because each adapter
        // package's tests run in a separate `bun test` process, but a
        // local `bun test packages/` across packages would.
        let html: string
        try {
          html = await render({
            source: fixture.source,
            adapter,
            props: fixture.props !== undefined ? structuredClone(fixture.props) : undefined,
            components: fixture.components,
            componentModules: fixture.componentModules,
            componentName: fixture.componentName,
          })
        } catch (err) {
          if (options.onRenderError?.(err as Error, fixture.id)) return
          throw err
        }
        expect(html).toBeTruthy()

        // 2. bf-p contract: children must not leak scope IDs (#1952).
        //    Rendered children are already in the DOM; serialising them
        //    into bf-p leaks nested scope IDs (bf-s=) and causes the
        //    router's region diff to false-swap on every navigation.
        for (const m of html.matchAll(/bf-p="([^"]*)"/g)) {
          const raw = m[1]
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
          try {
            const obj = JSON.parse(raw)
            if (obj && typeof obj === 'object' && 'children' in obj && typeof obj.children === 'string') {
              expect(obj.children).not.toMatch(/bf-s=/)
            }
          } catch { /* not JSON — skip */ }
        }

        // 3. Compare HTML output against reference
        if (referenceAdapter && referenceRender) {
          // Live reference: render with reference adapter and compare.
          // Strip the conditional-branch marker divergence on both sides
          // so the Hono `bf-c="sN"` attribute and Go comment-pair forms
          // collapse to the same canonical shape (#1266).
          const refAdapter = referenceAdapter()
          const refHtml = await referenceRender({
            source: fixture.source,
            adapter: refAdapter,
            // Same prop-mutation isolation as the adapter-under-test
            // call above (see comment there).
            props: fixture.props !== undefined ? structuredClone(fixture.props) : undefined,
            components: fixture.components,
            componentModules: fixture.componentModules,
            componentName: fixture.componentName,
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
