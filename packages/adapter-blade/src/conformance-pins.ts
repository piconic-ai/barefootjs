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
  // BF103 loop-body cross-template check no longer fires spuriously. (Both
  // fixtures are still skipped on this adapter via `render-divergences.ts`
  // — #2209 — for an unrelated signal-seeding gap.)
  // `static-array-children` no longer pinned (#2208) — `items`'s
  // array-literal initializer is now recognized as fully-static
  // (`resolveStaticLoopSource`) and inlined as a native PHP array literal
  // in the `@foreach` header, the same way a module-scope const's value is
  // already seeded.
  // The `([emoji, users]) => …` array-destructure param itself now lowers
  // (#2087 Phase B — see the destructure comment below), but the loop
  // ARRAY is a function-scope computed const (`const entries =
  // Object.entries(props.reactions ?? {}).filter(...)`) that the adapter
  // can't bind as a template variable — refused loudly with BF101 (same
  // check and policy as Jinja / ERB) instead of silently iterating zero
  // times over an unbound name.
  'static-array-from-props': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2321' },
  ],
  // BF101 (computed local-const loop array, as above) fires; BF103
  // (imported child in the loop body) no longer does now that the
  // conformance harness passes `siblingTemplatesRegistered: true` (#2205).
  'static-array-from-props-with-component': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2321' },
  ],
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
  // Faithful lowering tracked: https://github.com/piconic-ai/barefootjs/issues/2320 (successor to #2038)
  'filter-nested-callback-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2320' },
  ],
  'filter-nested-find-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2320' },
  ],
  // NB: TOP-LEVEL `.find` / `.findIndex` / `.findLast` / `.findLastIndex`
  // (text position) are NOT pinned here — like Jinja (unlike mojo, which
  // refuses them), Blade lowers them to `$bf->find_eval` / `find_index_eval`
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
  // A dynamic/signal-derived value now lowers through Blade's `{!! !!}` raw
  // echo (#2319) — `dangerous-inner-html-dynamic` is no longer pinned and
  // renders to Hono parity, same as the static case.
  // #2273: a method call on a prop typed as a built-in host rich type
  // (Date, Map, …) has no catalogued lowering in any adapter — this is a
  // compiler-level refusal (`checkRichTypeMethodCalls`, wired ahead of
  // `adapter.generate()`), not an adapter-specific gap, so it is pinned
  // identically across every adapter package including Hono.
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2356' }],
}
