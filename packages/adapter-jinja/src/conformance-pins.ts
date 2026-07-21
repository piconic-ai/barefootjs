/**
 * Per-fixture build-time contracts for shapes the Jinja adapter
 * intentionally refuses to lower. Mirrors xslate's set — the lowering
 * gates are shared code paths in the ported adapter (BF103/BF104 are
 * structural: cross-template child registration / destructure-loop-param
 * limits that apply identically regardless of target template language).
 * Consumed by this package's own conformance test (as `expectedDiagnostics`)
 * and by `bf compat` (issue-URL attribution).
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
  // `todo-app` / `todo-app-ssr` no longer pinned (#2205) — the conformance
  // harness now passes `siblingTemplatesRegistered: true` for fixtures with
  // sibling `components`, matching `bf build`'s real semantics, so the
  // BF103 loop-body cross-template check no longer fires spuriously. (Both
  // fixtures are still skipped on this adapter via `render-divergences.ts`
  // — #2209 — for an unrelated signal-seeding gap.)
  // `static-array-children` no longer pinned (#2208) — `items`'s
  // array-literal initializer is now recognized as fully-static
  // (`resolveStaticLoopSource`) and inlined as a native Jinja list/dict
  // literal in the `{% for %}` header, the same way a module-scope const's
  // value is already seeded.
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
  // (button/kbd graduated: the site/ui Button/Kbd `<Slot>` `{...props}` /
  // `{...children.props}` component-spread now lowers via nested
  // `dict(base, **top)` calls — see `jinja-adapter.ts`'s `renderComponent`
  // — instead of refusing with BF101, so these two no longer need a pin
  // here.)
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
  // A dynamic/signal-derived value now lowers through Jinja's `| safe` filter
  // (#2319) — `dangerous-inner-html-dynamic` is no longer pinned and renders
  // to Hono parity, same as the static case.
  // #2273: a method call on a prop typed as a built-in host rich type
  // (Date, Map, …) has no catalogued lowering in any adapter — this is a
  // compiler-level refusal (`checkRichTypeMethodCalls`, wired ahead of
  // `adapter.generate()`), not an adapter-specific gap, so it is pinned
  // identically across every adapter package including Hono.
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2274' }],
}
