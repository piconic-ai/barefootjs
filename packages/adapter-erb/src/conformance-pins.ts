/**
 * Per-fixture build-time contracts for shapes the ERB adapter
 * intentionally refuses to lower. Mirrors mojo's set — the lowering
 * gates (`isLowerableLoopDestructure`, `collectImportedLoopChild
 * ComponentErrors`, `refuseUnsupportedAttrExpression`, the #2038
 * nested-higher-order-callback gate) are shared code in `@barefootjs/jsx`
 * that every EP/ERB-family adapter reuses verbatim. Consumed by this
 * package's own conformance test (as `expectedDiagnostics`) and by
 * `bf compat` (issue-URL attribution).
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
  // `todo-app` / `todo-app-ssr` no longer pinned (#2205) — the conformance
  // harness now passes `siblingTemplatesRegistered: true` for fixtures with
  // sibling `components`, matching `bf build`'s real semantics, so the
  // BF103 loop-body cross-template check no longer fires spuriously. (Both
  // fixtures are still skipped on this adapter via `render-divergences.ts`
  // — #2209 — for an unrelated signal-seeding gap.)
  // `static-array-children` no longer pinned (#2208) — `items`'s
  // array-literal initializer is now recognized as fully-static
  // (`resolveStaticLoopSource`) and inlined as a native Ruby array/hash
  // literal in the loop-bound expression, the same way a module-scope
  // const's value is already seeded.
  // `static-array-from-props` / `static-array-from-props-with-component`:
  // the `.map(([emoji, users]) => …)` / `.map(([id, t]) => …)` callback is
  // a plain array-index destructure (the `.filter(...)` runs on a
  // separate `const entries = …` statement, so `loop.filterPredicate` is
  // unset — this is not the `.filter().map(destructure)` chain
  // `isLowerableLoopDestructure` still refuses), and #2087 Phase B's
  // segments-walking accessor DOES lower it natively. But both fixtures'
  // loop array is that same `entries` — a component-scope `const`
  // computed from `Object.entries(props.x).filter(...)`, a runtime
  // expression the ERB adapter has no mechanism to evaluate at SSR
  // render time (only a pure-literal or module-string const is ever
  // inlined; a computed const falls through to an unseeded `v[:entries]`
  // and crashes). This is a pre-existing, orthogonal gap the widened
  // destructure gate merely exposes — it reproduces identically with a
  // non-destructured param (verified) — not a destructure-lowering
  // limitation, so it is NOT part of #2087's scope. Tracked as its own
  // gap under https://github.com/piconic-ai/barefootjs/issues/2321;
  // pinned honestly as BF101 (the adapter's own check, see `renderLoop`'s
  // "Loop array is a bare identifier..." comment) rather than faked as
  // BF104 or silently producing broken Ruby.
  'static-array-from-props': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2321' },
  ],
  // BF103 (imported child in the loop body) no longer fires now that the
  // conformance harness passes `siblingTemplatesRegistered: true` (#2205).
  'static-array-from-props-with-component': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2321' },
  ],
  // #2087 Phase B: `isLowerableLoopDestructure` now admits every fixed-
  // binding shape (any field/index depth — `destructure-array-index-in-map`,
  // `destructure-nested-object-in-map`), array-rest (`rest-destructure-
  // array-in-map`, native `bf.slice`), and object-rest whose every use is a
  // member read or a `{...rest}` spread onto an intrinsic element
  // (`rest-destructure-object-in-map`, `rest-destructure-object-spread-in-
  // map`, `rest-destructure-nested-in-map` — native `Hash#except` builds a
  // true residual Hash). None of the six destructure-in-map fixtures are
  // pinned here any more; all render to Hono parity. See
  // `rubyAccessorFromSegments` / the object-rest-in-loop branch in
  // `erb-adapter.ts`'s `renderLoop`.
  // #2038: a filter predicate containing a nested `.find(...)` callback.
  // `find*` returns an element, not a boolean — there is no inline
  // predicate form, and the emitter used to silently degrade the call to
  // its receiver. The nested `.some` sibling
  // (`filter-nested-callback-predicate`) is NOT pinned: like mojo, ERB
  // lowers it to a real inline Ruby block predicate and must render to
  // Hono parity instead.
  // Faithful lowering tracked: https://github.com/piconic-ai/barefootjs/issues/2320 (successor to #2038)
  'filter-nested-find-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2320' },
  ],
  // #1467 demo-corpus context providers (`radio-group`, `accordion`,
  // `dialog`, `popover`, `select`, `dropdown-menu`, `combobox`,
  // `command`) are NOT pinned — an object-literal provider value lowers
  // to a Ruby Hash via `parseProviderObjectLiteral` (#1897): getter
  // members snapshot their body's SSR value, handler / function-shaped
  // members lower to `nil`.
  //
  // `button` / `kbd` are NOT pinned (unlike xslate): the auto-inferred
  // `<Slot>` sibling's `{...props}` / `{...children.props}` spread onto
  // its root element lowers via Ruby's native `**hash` double-splat in
  // the component-invocation Hash literal — the same shape mojo's EP
  // `%{$props}` flatten already handles.
  //
  // `data-table` is NOT pinned here either — it compiles clean
  // (`selected()[index]` → `index-access`, `.toFixed(2)` →
  // `bf.to_fixed`, `/* @client */` memo SSR-folded) and renders to Hono
  // parity. It stays in `skipMarkerConformance` below for the shared
  // `/* @client */` keyed-map slot-id elision contract only (same as
  // `todo-app`), not a render or BF101 gap.
  //
  // `array-map-function-reference` no longer pinned — a bare-identifier
  // `.map(format)` callback now resolves one hop to its declaration
  // (`resolveCallbackMethodFunctionReferences`, #2206), the same mechanism
  // #2090 established for `.sort(fnref)`.
  // `dangerous-inner-html` no longer pinned — a compile-time string-literal
  // `dangerouslySetInnerHTML={{ __html: '...' }}` is spliced directly into
  // the template as trusted raw text (`resolveDangerousInnerHtml`, #2207).
  // A dynamic/signal-derived value now lowers through ERB's unescaped
  // `<%= %>` (dropping the `bf.h(...)` escape wrap, #2319) — `dangerous-inner-
  // html-dynamic` is no longer pinned and renders to Hono parity, same as the
  // static case.
  // #2273: a method call on a prop typed as a built-in host rich type
  // (Date, Map, …) has no catalogued lowering in any adapter — this is a
  // compiler-level refusal (`checkRichTypeMethodCalls`, wired ahead of
  // `adapter.generate()`), not an adapter-specific gap, so it is pinned
  // identically across every adapter package including Hono.
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2356' }],
}
