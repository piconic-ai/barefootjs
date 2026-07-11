/**
 * Per-fixture build-time contracts for shapes the Blade adapter
 * intentionally refuses to lower. Mirrors Jinja's set — the lowering
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
  // BF103 loop-body cross-template check no longer fires spuriously.
  // `static-array-children` similarly no longer hits BF103, but now hits a
  // DIFFERENT, pre-existing, orthogonal gap: `items` is a function-scope
  // local const whose array-literal initializer the adapter's loop-source
  // gate refuses to bind (only string-derived locals resolve) — see #2208.
  'static-array-children': [{ code: 'BF101', severity: 'error' }],
  // The `([emoji, users]) => …` array-destructure param itself now lowers
  // (#2087 Phase B — see the destructure comment below), but the loop
  // ARRAY is a function-scope computed const (`const entries =
  // Object.entries(props.reactions ?? {}).filter(...)`) that the adapter
  // can't bind as a template variable — refused loudly with BF101 (same
  // check and policy as Jinja / ERB) instead of silently iterating zero
  // times over an unbound name.
  'static-array-from-props': [{ code: 'BF101', severity: 'error' }],
  // BF101 (computed local-const loop array, as above) fires; BF103
  // (imported child in the loop body) no longer does now that the
  // conformance harness passes `siblingTemplatesRegistered: true` (#2205).
  'static-array-from-props-with-component': [{ code: 'BF101', severity: 'error' }],
  // #2087 Phase B: every `.map()` destructure shape in the shared corpus
  // now lowers on Blade via an `@php(...)` local built from the binding's
  // structured `segments` path (`bladeLoopBindingAccessor` in
  // `lib/blade-naming.ts`) — fixed bindings at any field/index depth
  // (`destructure-array-index-in-map`, `destructure-nested-object-in-map`),
  // array-rest via `$bf->slice` (`rest-destructure-array-in-map`,
  // `rest-destructure-nested-in-map`), and object-rest via the new
  // `$bf->omit` residual helper, read by member access
  // (`rest-destructure-object-in-map`) or spread onto the element
  // (`rest-destructure-object-spread-in-map`). No `expectedDiagnostics`
  // pins remain for any of them — see `blade-adapter.ts`'s `renderLoop` for
  // the still-refused shapes (bare-value rest use, `.filter().map()`
  // chains, `__bf_`-prefixed names).
  // (button/kbd graduated: the site/ui Button/Kbd `<Slot>` `{...props}` /
  // `{...children.props}` component-spread now lowers via an
  // `array_merge(...)` fold — see `blade-adapter.ts`'s `renderComponent` —
  // instead of refusing with BF101, so these two no longer need a pin here.)
  // (`tagged-template-classname` graduated by #2092 — the tag resolves
  // through the interleave-tag catalogue and desugars to an untagged
  // template literal, so it lowers like any other className template.)
  // #2038: a filter predicate whose body contains a NESTED callback call
  // (`t => !picked().some(p => …)` / `t => picked().find(p => …)`). Blade
  // has no inline comprehension-with-nested-callback form usable from the
  // evaluator-JSON `*_eval` payload mechanism (this adapter's ONLY
  // higher-order-callback lowering path — see `blade-adapter.ts`'s file
  // header, divergence 3), so the compiler is loud (BF101) instead of
  // lossy, same as Jinja. The `/* @client */` twin
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
  // (text position) are NOT pinned here — like Jinja (unlike mojo, which
  // refuses them), Blade lowers them to `$bf->find_eval` / `find_index_eval`
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
  // Edge-case sweep (Priority 12): `dangerouslySetInnerHTML` requires a
  // deliberate raw-HTML (unescaped) output affordance in the target
  // template language. No lowering exists yet, so the compiler refuses
  // the shape loudly instead of emitting entity-escaped markup that
  // silently renders tags as text.
  'dangerous-inner-html': [{ code: 'BF101', severity: 'error' }],
}
