/**
 * TwigAdapter — Conformance Tests
 *
 * Runs the shared adapter conformance corpus (JSX fixtures, template
 * primitives, marker conformance) against the Twig adapter, rendering
 * each fixture end-to-end through real Twig + the bundled
 * `Barefoot\TwigBackend` PHP runtime via `renderTwigComponent`.
 *
 * The Twig adapter was ported from the Jinja adapter, so the skip /
 * diagnostic sets below start from Jinja's and diverge only where the
 * engine genuinely differs. Every divergence carries a one-line rationale.
 */

import { runAdapterConformanceTests } from '@barefootjs/adapter-tests'
import { TwigAdapter } from '../adapter'
import { renderTwigComponent, TwigNotAvailableError } from '../test-render'

runAdapterConformanceTests({
  name: 'twig',
  factory: () => new TwigAdapter(),
  render: renderTwigComponent,
  // Per-fixture build-time contracts for shapes the Twig adapter
  // intentionally refuses to lower. Mirrors Jinja's set — the lowering
  // gates are shared code paths in the ported adapter (BF103/BF104 are
  // structural: cross-template child registration / destructure-loop-param
  // limits that apply identically regardless of target template language).
  expectedDiagnostics: {
    // Sibling-imported child component in a loop body: emits a
    // cross-template call needing separate registration. BF103 makes
    // the requirement loud (same as Jinja).
    'static-array-children': [{ code: 'BF103', severity: 'error' }],
    // TodoApp / TodoAppSSR import `TodoItem` from a sibling file and
    // call it inside a keyed `.map`. Same BF103 (imported child in
    // `.map`) as Jinja.
    'todo-app': [{ code: 'BF103', severity: 'error' }],
    'todo-app-ssr': [{ code: 'BF103', severity: 'error' }],
    // The `([emoji, users]) => …` array-destructure param itself now lowers
    // (#2087 Phase B — see the destructure comment below), but the loop
    // ARRAY is a function-scope computed const (`const entries =
    // Object.entries(props.reactions ?? {}).filter(...)`) that the adapter
    // can't bind as a template variable — refused loudly with BF101 (same
    // check and policy as Jinja / ERB) instead of silently iterating zero
    // times over an unbound name.
    'static-array-from-props': [{ code: 'BF101', severity: 'error' }],
    // Both BF103 (imported child) and BF101 (computed local-const loop
    // array, as above) fire.
    'static-array-from-props-with-component': [
      { code: 'BF103', severity: 'error' },
      { code: 'BF101', severity: 'error' },
    ],
    // #2087 Phase B: every `.map()` destructure shape in the shared corpus
    // now lowers on Twig via a `{% set %}` local built from the binding's
    // structured `segments` path (`twigLoopBindingAccessor` in
    // `lib/twig-naming.ts`) — fixed bindings at any field/index depth
    // (`destructure-array-index-in-map`, `destructure-nested-object-in-map`),
    // array-rest via `bf.slice` (`rest-destructure-array-in-map`,
    // `rest-destructure-nested-in-map`), and object-rest via the new
    // `bf.omit` residual helper, read by member access
    // (`rest-destructure-object-in-map`) or spread onto the element
    // (`rest-destructure-object-spread-in-map`). No `expectedDiagnostics`
    // pins remain for any of them — see `twig-adapter.ts`'s `renderLoop` for
    // the still-refused shapes (bare-value rest use, `.filter().map()`
    // chains, `__bf_`-prefixed names).
    // The site/ui Button auto-infers a `<Slot>` sibling that spreads
    // `{...props}` / `{...children.props}` onto its root element. Twig
    // hash literals can't splat a runtime dict into named call-site
    // entries either (same engine limitation as Jinja's dict-splat), so
    // the adapter refuses the spread with BF101 rather than emit a broken
    // render_child call. Same genuine engine divergence as Jinja, pinned
    // declaratively here.
    'button': [{ code: 'BF101', severity: 'error' }],
    // `kbd` auto-infers the same `<Slot>` `{...props}` spread as `button`
    // above — refused with BF101 for the identical Twig hash-splat
    // reason, not a render-mismatch (so it's pinned here, not in
    // `skipJsx`).
    'kbd': [{ code: 'BF101', severity: 'error' }],
    // (`tagged-template-classname` graduated by #2092 — the tag resolves
    // through the interleave-tag catalogue and desugars to an untagged
    // template literal, so it lowers like any other className template.)
    // #2038: a filter predicate whose body contains a NESTED callback call
    // (`t => !picked().some(p => …)` / `t => picked().find(p => …)`). Twig
    // has no inline comprehension-with-nested-callback form usable from the
    // evaluator-JSON `*_eval` payload mechanism (this adapter's ONLY
    // higher-order-callback lowering path — see `twig-adapter.ts`'s file
    // header, divergence 3), so the compiler is loud (BF101) instead of
    // lossy, same as Jinja. The `/* @client */` twin
    // (`filter-nested-callback-predicate-client`) has no pin here: it must
    // render clean on every adapter, which asserts the suppression contract.
    // https://github.com/piconic-ai/barefootjs/issues/2038
    'filter-nested-callback-predicate': [{ code: 'BF101', severity: 'error' }],
    'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error' }],
    // NB: TOP-LEVEL `.find` / `.findIndex` / `.findLast` / `.findLastIndex`
    // (text position) are NOT pinned here — like Jinja (unlike mojo, which
    // refuses them), Twig lowers them to `bf.find_eval` / `find_index_eval`
    // / etc. via the same evaluator-JSON mechanism as `.filter` / `.every` /
    // `.some`, so they render. Only the NESTED-in-a-predicate form above is
    // refused (#2038).
    // #2073 follow-up (same as Jinja): a function-reference `.map(format)`
    // callback has no arrow body to serialize — not a CALLBACK_METHODS shape
    // (`asCallbackMethodCall` requires an arrow argument) — so the shared
    // `isSupported`'s `UNSUPPORTED_METHODS` gate refuses it with the generic
    // "Expression not supported" BF101 rather than emitting a broken
    // template.
    'array-map-function-reference': [{ code: 'BF101', severity: 'error' }],
  },
  // Template-primitive registry: `USER_IMPORT_VIA_CONST` and
  // `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` now pass (#2069) — a bespoke user
  // import can never be added to the string-keyed registry, but the
  // shared `RelocateEnv.loweringMatchers` acceptance path recognises it
  // via a `LoweringPlugin` the case setup registers around the compile
  // (see `packages/adapter-tests/src/cases/template-primitives.ts`). No
  // skips left, so `skipTemplatePrimitives` is omitted entirely.
  skipMarkerConformance: new Set([
    // Same as Hono / Jinja: `/* @client */` markers on TodoApp's keyed
    // `.map` intentionally elide a slot id from the SSR template that
    // the IR still declares (s6). See hono-adapter.test for the contract.
    'todo-app',
    // Same `/* @client */` keyed-map elision (data-table).
    'data-table',
  ]),
  onRenderError: (err, id) => {
    if (err instanceof TwigNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})
