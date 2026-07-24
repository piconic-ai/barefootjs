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
  // Off-subset filter predicate (`typeof`) the compiler can't lower; a
  // JS-runtime target runs it, a DSL adapter surfaces BF021 + `/* @client */`.
  // See spec/callback-fidelity.md.
  'filter-typeof-predicate': [{ code: 'BF021', severity: 'error' }],
  // `.fill(value)` mutates the receiver in place — no template lowering
  // on any DSL adapter; a JS-runtime target runs it, a DSL adapter
  // surfaces BF101 + `/* @client */`. See spec/callback-fidelity.md.
  'fill-unsupported': [{ code: 'BF101', severity: 'error' }],
  // Off-subset `.find()` / `.some()` / `.every()` predicate (`typeof`) the
  // compiler can't lower; a JS-runtime target runs it, a DSL adapter
  // surfaces BF101 + `/* @client */`. See spec/callback-fidelity.md.
  'find-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  'some-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  'every-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  // `todo-app` / `todo-app-ssr` no longer pinned (#2205) — the conformance
  // harness now passes `siblingTemplatesRegistered: true` for fixtures with
  // sibling `components`, matching `bf build`'s real semantics, so the
  // BF103 loop-body cross-template check no longer fires spuriously. (Both
  // fixtures are still skipped on this adapter via `render-divergences.ts`
  // — #2209 — for an unrelated signal-seeding gap.)
  // `static-array-children` no longer pinned (#2208) — `items`'s
  // array-literal initializer is now recognized as fully-static
  // (`resolveStaticLoopSource`) and inlined as a native MiniJinja
  // list/dict literal in the `{% for %}` header, the same way a
  // module-scope const's value is already seeded.
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
  // https://github.com/piconic-ai/barefootjs/issues/2321.
  'static-array-from-props': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2321' },
  ],
  // BF101 (unresolvable computed loop array, see above) fires; BF103
  // (imported child in the loop body) no longer does now that the
  // conformance harness passes `siblingTemplatesRegistered: true` (#2205).
  'static-array-from-props-with-component': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2321' },
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
  // (button/kbd graduated: the site/ui Button/Kbd `<Slot>` `{...props}` /
  // `{...children.props}` component-spread now lowers via nested
  // `dict(base, **top)` calls — see `minijinja-adapter.ts`'s
  // `renderComponent` — instead of refusing with BF101, so these two no
  // longer need a pin here.)
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
  // Faithful lowering tracked: https://github.com/piconic-ai/barefootjs/issues/2320 (successor to #2038)
  'filter-nested-callback-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2320' },
  ],
  'filter-nested-find-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2320' },
  ],
  // NB: TOP-LEVEL `.find` / `.findIndex` / `.findLast` / `.findLastIndex`
  // (text position) are NOT pinned here — like xslate (unlike mojo, which
  // refuses them), Jinja lowers them to `bf.find_eval` / `find_index_eval`
  // / etc. via the same evaluator-JSON mechanism as `.filter` / `.every` /
  // `.some`, so they render. Only the NESTED-in-a-predicate form above is
  // refused (#2038).
  // `array-map-function-reference` no longer pinned — a bare-identifier
  // `.map(format)` callback now resolves one hop to its declaration
  // (`resolveCallbackMethodFunctionReferences`, #2206), the same mechanism
  // #2090 established for `.sort(fnref)`.
  // `dangerous-inner-html` no longer pinned — a compile-time string-literal
  // `dangerouslySetInnerHTML={{ __html: '...' }}` is spliced directly into
  // the template as trusted raw text (`resolveDangerousInnerHtml`, #2207).
  // A dynamic/signal-derived value now lowers through MiniJinja's `| safe`
  // filter (#2319) — `dangerous-inner-html-dynamic` is no longer pinned and
  // renders to Hono parity, same as the static case.
  // #2273: a method call on a prop typed as a built-in host rich type
  // (Date, Map, …) has no catalogued lowering in any adapter — this is a
  // compiler-level refusal (`checkRichTypeMethodCalls`, wired ahead of
  // `adapter.generate()`), not an adapter-specific gap, so it is pinned
  // identically across every adapter package including Hono.
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2356' }],
}
