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
    // #1244 catalog: `{...rest}` spread back onto the root of a
    // destructured loop param when there is no non-`key` explicit attr.
    // The collision-safe merge emit (#1244) only triggers when a
    // non-`key` explicit attr coexists with the spread (so JSX
    // rightmost-wins is at risk); a lone `<li key={id} {...rest}>` keeps
    // the legacy inline form to preserve the unconditional
    // `data-key="${value}"` debug contract (`spreadAttrs` would otherwise
    // skip `key={undefined}`). That leaves Hono SSR emitting the
    // residual-object attributes before `data-key` (the synthesized
    // hydrationAttr is appended at end) and CSR emitting `data-key`
    // before the spread (source order). Both forms parse to identical
    // DOM — no JSX-semantics violation, only attribute-order divergence.
    // The collision shape that DOES violate semantics is locked in by
    // `compiler-stress-1244.test.ts` (Layer 1).
    'rest-destructure-object-spread-in-map',
    // #1407 follow-up: the destructured-rest / SolidJS-style spread
    // fixtures pin the Go (and Mojo) SSR-side bag-plumbing contract,
    // which is where the original onboarding regression manifested.
    // The CSR runtime path for the same shapes is a separate concern
    // — `applyRestAttrs(_v, _p, exclude)` needs the JS-runtime spread
    // bag to be present in `_p`, but the test harness's single `props`
    // object can't simultaneously carry the flat shape JS expects and
    // the typed shape Go's Input struct requires. Per-adapter
    // expectedHtml on the Go side covers the SSR contract; the CSR
    // runtime parity for open-ended bag shapes is tracked as a
    // follow-up to the harness rather than blocking this fix.
    'jsx-spread-rest-prop',
    'jsx-spread-props-object',
    // #1467 Phase 2a: the shared-component corpus (#1466) is now
    // exercised in CSR mode — the harness honours `props.__instanceId`
    // for the root `bf-s` (and child scope ids), so the captured
    // `<Name>_test` root canonicalises to `<Name>_*` on both sides.
    // `counter-shared`, `conditional-return-{button,link}`, `form`,
    // `portal`, `todo-app-ssr`, and `ai-chat` all pass now.
    //
    // The entries below stay skipped for reasons UNRELATED to the
    // scope-id fix — each hits a pre-existing CSR template-eval limit:
    //
    //   - `toggle-shared` / `reactive-props` /
    //     `props-reactivity-comparison`: the CSR template lambda closes
    //     over a file-scope/local binding (`toggleItems`, `value`) that
    //     only init wires up; template-eval raises a ReferenceError.
    //     Same class as `static-array-children` above ("Local array
    //     variable is not available at CSR template module scope").
    'toggle-shared',
    'reactive-props',
    'props-reactivity-comparison',
    //   - `todo-app`: its keyed `.map(...)` of `TodoItem` children is
    //     materialised at init time, so the SSR snapshot captures the
    //     empty `<ul>` while the CSR template lambda renders the full
    //     list — same divergence as `static-array-from-props` above.
    'todo-app',
    // #1448 Tier B — iteration shape fixtures are SSR-only prop-based
    // components. The CSR template path can't resolve bare prop refs
    // (items, etc.) without `"use client"` + signal wiring.
    'array-entries',
    'array-keys',
    'array-values',
    // #1467 Phase 2b: `kbd/index.tsx` exports two components (`Kbd` then
    // `KbdGroup`). The CSR harness evaluates `__lastComponent` — the last
    // `hydrate()` registration — which is `KbdGroup`, so it renders the
    // wrong sibling (`data-slot="kbd-group"` vs the pinned `Kbd`'s
    // `data-slot="kbd"`). Same multi-export-source harness limitation that
    // CSR-skips `reactive-props` / `props-reactivity-comparison`; the
    // SSR-side pin (`componentName: 'Kbd'`) keeps Hono conformance correct,
    // and `kbd` ships no interactions so the fixture-hydrate layer skips it
    // regardless.
    'kbd',
    // #1467 Phase 2b: `input/index.tsx` renders its `placeholder` (and any
    // other native attr) through the `{...props}` spread → `applyRestAttrs`
    // at init time, not as an explicit template attribute. The CSR harness
    // stubs `applyRestAttrs` as a noop (it only evaluates the template
    // lambda), so the spread-applied `placeholder` is absent from CSR output
    // while present in the SSR HTML. Same `applyRestAttrs`-not-modeled
    // limitation that CSR-skips `jsx-spread-rest-prop` / `jsx-spread-props-
    // object`; the real-browser fixture-hydrate layer exercises the spread
    // for real (and the typed value survives hydration there).
    'input',
    // #1467 demo corpus: `radio-group-demo.tsx` exports three sibling
    // demos and the CSR harness evaluates `__lastComponent` — the last
    // `hydrate()` registration (`RadioGroupCardDemo`) — rather than the
    // pinned `RadioGroupBasicDemo`. Same multi-export-source harness
    // limitation that CSR-skips `kbd` / `reactive-props`; Hono SSR
    // conformance keeps the pinned export honest (`componentName`), and
    // the fixture-hydrate layer drives the real composed hydration.
    'radio-group',
  ])

  for (const fixture of jsxFixtures) {
    if (skipFixtures.has(fixture.id)) continue
    if (!fixture.expectedHtml) continue

    test(`[${fixture.id}] ${fixture.description}`, async () => {
      const html = await renderCsrComponent({
        source: fixture.source,
        // Clone props per render so a mutating method in the fixture
        // source (`.reverse()`, `.sort()`) doesn't poison the shared
        // `fixture.props` object across SSR and CSR runs. Mirrors the
        // same isolation in `jsx-runner.ts` for the SSR side.
        props: fixture.props !== undefined ? structuredClone(fixture.props) : undefined,
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
