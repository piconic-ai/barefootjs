/**
 * JinjaAdapter — Conformance Tests
 *
 * Runs the shared adapter conformance corpus (JSX fixtures, template
 * primitives, marker conformance) against the Jinja2 adapter, rendering
 * each fixture end-to-end through real Jinja2 + the bundled
 * `barefootjs.backend_jinja.JinjaBackend` via `renderJinjaComponent`.
 *
 * The Jinja adapter was ported from the Text::Xslate (Kolon) adapter, so
 * the skip / diagnostic sets below start from xslate's and diverge only
 * where the engine genuinely differs. Every divergence carries a one-line
 * rationale.
 */

import { runAdapterConformanceTests } from '@barefootjs/adapter-tests'
import { JinjaAdapter } from '../adapter'
import { renderJinjaComponent, PythonNotAvailableError } from '../test-render'

runAdapterConformanceTests({
  name: 'jinja',
  factory: () => new JinjaAdapter(),
  render: renderJinjaComponent,
  // Per-fixture build-time contracts for shapes the Jinja adapter
  // intentionally refuses to lower. Mirrors xslate's set — the lowering
  // gates are shared code paths in the ported adapter (BF103/BF104 are
  // structural: cross-template child registration / destructure-loop-param
  // limits that apply identically regardless of target template language).
  expectedDiagnostics: {
    // Sibling-imported child component in a loop body: emits a
    // cross-template call needing separate registration. BF103 makes
    // the requirement loud (same as xslate).
    'static-array-children': [{ code: 'BF103', severity: 'error' }],
    // TodoApp / TodoAppSSR import `TodoItem` from a sibling file and
    // call it inside a keyed `.map`. Same BF103 (imported child in
    // `.map`) as xslate.
    'todo-app': [{ code: 'BF103', severity: 'error' }],
    'todo-app-ssr': [{ code: 'BF103', severity: 'error' }],
    // #2087 Phase A/B widened the destructure gate (`isLowerableLoopDestructure`)
    // to admit array-index / nested-path fixed bindings, so the
    // `([emoji, users]) => ...` / `([id, t]) => ...` params in these two
    // fixtures no longer trip BF104 — the destructure itself now lowers
    // cleanly to a native `{% set %}` accessor. But both fixtures' loop
    // array is `entries`, a bare identifier bound to a function-scope local
    // const with a NON-inlineable initializer
    // (`Object.entries(props.x ?? {}).filter(...)`) — a pre-existing,
    // orthogonal limitation this adapter has always had (it only ever
    // INLINES a local const's value at its use site — numeric/string
    // literal, or a static-record-literal lookup — never binds one as a
    // `{% set %}` template local), just never reachable before because the
    // narrower pre-#2087 gate refused the destructure param first. Left
    // unhandled it would silently render an EMPTY list (Jinja's
    // `ChainableUndefined` tolerates iterating an unbound name as zero
    // iterations) instead of failing loudly, so `renderLoop` in
    // `jinja-adapter.ts` now detects this shape and raises BF101 instead —
    // see the "Loop array `<name>` is a local computed value" diagnostic.
    // Fixing the underlying gap (computed-array-from-props as a loop
    // source) is out of scope for #2087; tracked as a follow-up at
    // https://github.com/piconic-ai/barefootjs/issues/2087.
    'static-array-from-props': [{ code: 'BF101', severity: 'error' }],
    // Both BF103 (imported child) and BF101 (unresolvable computed loop
    // array, see above) fire.
    'static-array-from-props-with-component': [
      { code: 'BF103', severity: 'error' },
      { code: 'BF101', severity: 'error' },
    ],
    // Rest-destructure / structured-path `.map()` callbacks (#2087 Phase B):
    // `isLowerableLoopDestructure` now admits fixed bindings at any
    // field/index depth, array-rest (`bf.slice`), and object-rest whose uses
    // are member reads or a `{...rest}` spread onto an intrinsic element
    // (`bf.omit` builds the TRUE residual dict). Each binding becomes a
    // native `{% set %}` local off the per-item var — see
    // `renderLoop`/`jinjaAccessorFromSegments` in `jinja-adapter.ts`. So
    // `rest-destructure-object-in-map`, `rest-destructure-object-spread-in-map`,
    // `rest-destructure-array-in-map`, `rest-destructure-nested-in-map`,
    // `destructure-array-index-in-map`, and `destructure-nested-object-in-map`
    // all render clean now — none of them are pinned here.
    // The site/ui Button auto-infers a `<Slot>` sibling that spreads
    // `{...props}` / `{...children.props}` onto its root element. Jinja
    // dict literals can't splat a runtime dict into named call-site
    // entries either (same engine limitation as Kolon's hashref method
    // args), so the adapter refuses the spread with BF101 rather than
    // emit a broken render_child call. Same genuine engine divergence as
    // xslate, pinned declaratively here.
    'button': [{ code: 'BF101', severity: 'error' }],
    // `kbd` auto-infers the same `<Slot>` `{...props}` spread as `button`
    // above — refused with BF101 for the identical Jinja dict-splat
    // reason, not a render-mismatch (so it's pinned here, not in
    // `skipJsx`).
    'kbd': [{ code: 'BF101', severity: 'error' }],
    // (`tagged-template-classname` graduated by #2092 — the tag resolves
    // through the interleave-tag catalogue and desugars to an untagged
    // template literal, so it lowers like any other className template.)
    // #2038: a filter predicate whose body contains a NESTED callback call
    // (`t => !picked().some(p => …)` / `t => picked().find(p => …)`). Jinja
    // has no inline comprehension-with-nested-callback form usable from the
    // evaluator-JSON `*_eval` payload mechanism (this adapter's ONLY
    // higher-order-callback lowering path — see `jinja-adapter.ts`'s file
    // header, divergence 3), so the compiler is loud (BF101) instead of
    // lossy, same as xslate. The `/* @client */` twin
    // (`filter-nested-callback-predicate-client`) has no pin here: it must
    // render clean on every adapter, which asserts the suppression contract.
    // https://github.com/piconic-ai/barefootjs/issues/2038
    'filter-nested-callback-predicate': [{ code: 'BF101', severity: 'error' }],
    'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error' }],
    // NB: TOP-LEVEL `.find` / `.findIndex` / `.findLast` / `.findLastIndex`
    // (text position) are NOT pinned here — like xslate (unlike mojo, which
    // refuses them), Jinja lowers them to `bf.find_eval` / `find_index_eval`
    // / etc. via the same evaluator-JSON mechanism as `.filter` / `.every` /
    // `.some`, so they render. Only the NESTED-in-a-predicate form above is
    // refused (#2038).
    // #2073 follow-up (same as xslate): a function-reference `.map(format)`
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
    // Same as Hono / Xslate: `/* @client */` markers on TodoApp's keyed
    // `.map` intentionally elide a slot id from the SSR template that
    // the IR still declares (s6). See hono-adapter.test for the contract.
    'todo-app',
    // Same `/* @client */` keyed-map elision (data-table).
    'data-table',
  ]),
  onRenderError: (err, id) => {
    if (err instanceof PythonNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})
