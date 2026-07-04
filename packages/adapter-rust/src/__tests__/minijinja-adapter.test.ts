/**
 * MinijinjaAdapter — Conformance Tests
 *
 * Runs the shared adapter conformance corpus (JSX fixtures, template
 * primitives, marker conformance) against the minijinja adapter, rendering
 * each fixture end-to-end through real minijinja + the bundled Rust
 * `barefootjs` runtime crate via `renderMinijinjaComponent`.
 *
 * Near-verbatim port of `packages/adapter-jinja/src/__tests__/jinja-adapter.test.ts`.
 * The Jinja2 adapter was ported from the Text::Xslate (Kolon) adapter, so
 * the skip / diagnostic sets below start from adapter-jinja's (itself
 * starting from xslate's) and diverge only where the engine genuinely
 * differs — minijinja 2.21 is Jinja2-compatible for everything this adapter
 * emits (verified by an orchestrator spike; see `minijinja-adapter.ts`'s
 * file header), so NONE of adapter-jinja's pins are expected to change here.
 * Every divergence carries a one-line rationale.
 */

import { runAdapterConformanceTests, TemplatePrimitiveCaseId } from '@barefootjs/adapter-tests'
import { MinijinjaAdapter } from '../adapter'
import { renderMinijinjaComponent, RustNotAvailableError } from '../test-render'

runAdapterConformanceTests({
  name: 'minijinja',
  factory: () => new MinijinjaAdapter(),
  render: renderMinijinjaComponent,
  // Per-fixture build-time contracts for shapes the adapter intentionally
  // refuses to lower. Mirrors adapter-jinja's set (itself mirroring
  // xslate's) — the lowering gates are shared code paths in the ported
  // adapter (BF103/BF104 are structural: cross-template child registration
  // / destructure-loop-param limits that apply identically regardless of
  // target template language or render engine).
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
    // The `([emoji, users]) => ...` / `([id, t]) => ...` params in these two
    // fixtures no longer trip BF104 — the destructure itself now lowers
    // cleanly to a native `{% set %}` accessor (#2087 Phase B). But both
    // fixtures' loop array is `entries`, a bare identifier bound to a
    // function-scope local const with a NON-inlineable initializer
    // (`Object.entries(props.x ?? {}).filter(...)`) — a pre-existing,
    // orthogonal limitation this adapter has always had (it only ever
    // INLINES a local const's value at its use site — numeric/string
    // literal, or a static-record-literal lookup — never binds one as a
    // `{% set %}` template local), just never reachable before because the
    // narrower pre-#2087 gate refused the destructure param first. Left
    // unhandled it would silently render an EMPTY list (minijinja's
    // `UndefinedBehavior::Chainable` tolerates iterating an unbound name as
    // zero iterations) instead of failing loudly, so `renderLoop` in
    // `minijinja-adapter.ts` now detects this shape and raises BF101
    // instead — see the "Loop array `<name>` is a local computed value"
    // diagnostic (mirrors adapter-jinja's identical check). Fixing the
    // underlying gap (computed-array-from-props as a loop source) is out of
    // scope for #2087; tracked as a follow-up at
    // https://github.com/piconic-ai/barefootjs/issues/2087.
    'static-array-from-props': [{ code: 'BF101', severity: 'error' }],
    // Both BF103 (imported child) and BF101 (unresolvable computed loop
    // array, see above) fire.
    'static-array-from-props-with-component': [
      { code: 'BF103', severity: 'error' },
      { code: 'BF101', severity: 'error' },
    ],
    // Rest-destructure `.map()` callbacks (#2087 Phase B): every shape now
    // lowers natively — fixed bindings at any depth/shape via a chained
    // Jinja accessor built off `LoopParamBinding.segments`
    // (`minijinjaAccessorFromSegments`), array-rest via the runtime's
    // `bf.slice`, and object-rest (read via member access OR spread onto an
    // intrinsic element) via a TRUE residual dict from the new `bf.omit`
    // runtime helper. No `expectedDiagnostics` pins remain for any of the
    // `rest-destructure-*-in-map` / `destructure-*-in-map` fixtures — see
    // `rest-destructure-object-spread-in-map` for the residual-spread case
    // and `destructure-array-index-in-map` / `destructure-nested-object-in-map`
    // for the no-rest fixed-binding shapes.
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
    // Tagged-template-literal call in a className — same family, same
    // refusal (BF101) as xslate: the lowering pipeline can't represent a
    // tagged-template-literal call expression in Jinja.
    'tagged-template-classname': [{ code: 'BF101', severity: 'error' }],
    // #2038: a filter predicate whose body contains a NESTED callback call
    // (`t => !picked().some(p => …)` / `t => picked().find(p => …)`). Jinja
    // has no inline comprehension-with-nested-callback form usable from the
    // evaluator-JSON `*_eval` payload mechanism (this adapter's ONLY
    // higher-order-callback lowering path — see `minijinja-adapter.ts`'s file
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
  // Template-primitive registry parity: same V1 surface as xslate, so the
  // same two cases stay skipped (bespoke user import + customSerialize
  // can't render server-side without user-supplied helper mappings).
  skipTemplatePrimitives: new Set([
    TemplatePrimitiveCaseId.USER_IMPORT_VIA_CONST,
    TemplatePrimitiveCaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
  ]),
  skipMarkerConformance: new Set([
    // Same as Hono / Xslate: `/* @client */` markers on TodoApp's keyed
    // `.map` intentionally elide a slot id from the SSR template that
    // the IR still declares (s6). See hono-adapter.test for the contract.
    'todo-app',
    // Same `/* @client */` keyed-map elision (data-table).
    'data-table',
  ]),
  onRenderError: (err, id) => {
    if (err instanceof RustNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})
