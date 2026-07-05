/**
 * Per-fixture build-time contracts for shapes the adapter intentionally
 * refuses to lower. Mirrors adapter-jinja's set (itself mirroring
 * xslate's) — the lowering gates are shared code paths in the ported
 * adapter (BF103/BF104 are structural: cross-template child registration
 * / destructure-loop-param limits that apply identically regardless of
 * target template language or render engine). Consumed by this package's
 * own conformance test (as `expectedDiagnostics`) and by `bf compat`
 * (issue-URL attribution).
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
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
  'static-array-from-props': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2087' },
  ],
  // Both BF103 (imported child) and BF101 (unresolvable computed loop
  // array, see above) fire.
  'static-array-from-props-with-component': [
    { code: 'BF103', severity: 'error' },
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2087' },
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
  // (`tagged-template-classname` graduated by #2092 — the tag resolves
  // through the interleave-tag catalogue and desugars to an untagged
  // template literal, so it lowers like any other className template.)
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
  'filter-nested-callback-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2038' },
  ],
  'filter-nested-find-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2038' },
  ],
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
}
