/**
 * CSR Conformance Tests
 *
 * Verifies that CSR template HTML output matches HonoAdapter reference output.
 * For each JSX fixture, compiles to client JS, evaluates the template function,
 * and compares the resulting HTML against the fixture's expectedHtml.
 */

import { describe, test, expect } from 'bun:test'
import { jsxFixtures } from '../../fixtures'
import { normalizeHTML, stripConditionalMarkersForCrossAdapter } from '../jsx-runner'
import { renderCsrComponent } from '../csr-render'

describe('CSR Conformance Tests', () => {
  // Fixtures to skip in CSR conformance tests.
  // Each entry documents why the fixture cannot be tested in CSR mode.
  const skipFixtures = new Set([
    // Stateless components: no client JS emitted (fully server-rendered)
    'props-static',
    'nested-elements',
    'void-elements',
    'class-vs-classname',
    'style-attribute',
    'fragment',
    'default-props',
    // Local array variable (items) is not available at CSR template module scope.
    // CSR templates only have access to props and signals, not file-scope constants.
    'static-array-children',
    // #1247: prop-derived static-array loops materialize their children at init
    // time (via the clone-and-insert fallback in the static-loop emitter), not
    // at template-eval time. This test harness runs only the `template:`
    // lambda, so the post-init DOM shape is verified by the runtime regression
    // in `packages/client/__tests__/runtime/static-loop-csr-materialize.test.ts`.
    'static-array-from-props',
    // #1268: same reason as `static-array-from-props` — the childComponent
    // variant also materialises children at init time via the clone-and-
    // insert fallback, not at template-eval time. CSR coverage lives in
    // `packages/client/__tests__/runtime/static-loop-csr-materialize.test.ts`.
    'static-array-from-props-with-component',
    // Static style object is converted at compile time — no runtime needed.
    // Attribute ordering differs between SSR (style first) and CSR injection (bf-s first).
    'style-object-static',
    // Synthetic scope wrapper has style="display:contents" before bf-s (#968).
    // Same attribute-ordering divergence as style-object-static/-dynamic.
    'top-level-ternary',
    // Same synthetic-wrapper attribute-order divergence as top-level-ternary
    // (#971 PR 5 uses the identical wrapper for non-JSX-direct returns).
    'return-logical-and',
    'return-logical-or',
    'return-nullish-coalescing',
    'return-map',
    // CSR's child-component render emits the parent's scope marker
    // alongside the child's, producing duplicate `bf-s` attributes
    // (e.g. `bf-s="test_s0" ... bf-s="test"`). Same class of
    // CSR/SSR attribute-shape divergence as `top-level-ternary` /
    // `return-*` above. The contract this fixture pins —
    // `<Slot className={\`base \${MAP[KEY]}\`}>` rendering the right
    // class — is verified at the SSR conformance layer for all
    // template-based adapters; the duplicate-`bf-s` issue is its own
    // follow-up.
    'record-index-lookup-via-child-prop',
    // #1244 stress catalog: surfaced CSR-only divergences. The fixture
    // docstrings record the symptom in detail; tracked as sub-issues
    // of #1244 for individual fix-up.
    //
    // - jsx-spread-reactive: CSR template calls `spreadAttrs(...)`
    //   without importing it → ReferenceError at hydration.
    // - member-expression-tag: CSR renders `<Pkg.Comp />` as literal
    //   text `[Pkg.Comp]` instead of resolving the component.
    // - children-jsx-expression: CSR emits duplicate `bf-s` attrs and
    //   drops the inner scope marker (same family as the
    //   `record-index-lookup-via-child-prop` entry above).
    'jsx-spread-reactive',
    'member-expression-tag',
    'children-jsx-expression',
  ])

  for (const fixture of jsxFixtures) {
    if (skipFixtures.has(fixture.id)) continue
    if (!fixture.expectedHtml) continue

    test(`[${fixture.id}] ${fixture.description}`, async () => {
      const html = await renderCsrComponent({
        source: fixture.source,
        props: fixture.props,
        components: fixture.components,
      })

      expect(html).toBeTruthy()

      // Strip the conditional-branch marker divergence (#1266) on both
      // sides so the Go comment-pair form and the Hono bf-c attribute
      // form collapse to the same canonical shape. `normalizeHTML`
      // intentionally preserves both forms so the canonical fixture
      // HTML (and the SSR-hydration contract test that reads it) keeps
      // the SSR-side markers; cross-adapter collapsing happens only
      // here at compare time.
      const normalizedHtml = stripConditionalMarkersForCrossAdapter(normalizeHTML(html))
      const normalizedExpected = stripConditionalMarkersForCrossAdapter(normalizeHTML(fixture.expectedHtml!))
      expect(normalizedHtml).toBe(normalizedExpected)
    })
  }
})
