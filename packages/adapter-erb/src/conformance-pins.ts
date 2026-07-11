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
  // `todo-app` / `todo-app-ssr` no longer pinned (#2205) — the conformance
  // harness now passes `siblingTemplatesRegistered: true` for fixtures with
  // sibling `components`, matching `bf build`'s real semantics, so the
  // BF103 loop-body cross-template check no longer fires spuriously. (Both
  // fixtures are still skipped on this adapter via `render-divergences.ts`
  // — #2209 — for an unrelated signal-seeding gap.)
  // `static-array-children` similarly no longer hits BF103, but now hits a
  // DIFFERENT, pre-existing, orthogonal gap: `items` is a function-scope
  // local const whose array-literal initializer the adapter's loop-source
  // gate refuses to bind (only string-derived locals resolve) — see #2208.
  'static-array-children': [{ code: 'BF101', severity: 'error' }],
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
  // gap under https://github.com/piconic-ai/barefootjs/issues/2087;
  // pinned honestly as BF101 (the adapter's own check, see `renderLoop`'s
  // "Loop array is a bare identifier..." comment) rather than faked as
  // BF104 or silently producing broken Ruby.
  'static-array-from-props': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2087' },
  ],
  // BF103 (imported child in the loop body) no longer fires now that the
  // conformance harness passes `siblingTemplatesRegistered: true` (#2205).
  'static-array-from-props-with-component': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2087' },
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
  // https://github.com/piconic-ai/barefootjs/issues/2038
  'filter-nested-find-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2038' },
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
  // #2073 follow-up: a function-reference `.map(format)` callback has no
  // arrow body to serialize — not a CALLBACK_METHODS shape — so the
  // UNSUPPORTED_METHODS gate (shared `@barefootjs/jsx` code) refuses it
  // with BF101 rather than emitting a broken template. Same pin as
  // mojo/xslate.
  'array-map-function-reference': [{ code: 'BF101', severity: 'error' }],
  // Edge-case sweep (Priority 12): `dangerouslySetInnerHTML` requires a
  // deliberate raw-HTML (unescaped) output affordance in the target
  // template language. No lowering exists yet, so the compiler refuses
  // the shape loudly instead of emitting entity-escaped markup that
  // silently renders tags as text.
  'dangerous-inner-html': [{ code: 'BF101', severity: 'error' }],
}
