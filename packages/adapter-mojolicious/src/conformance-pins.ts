/**
 * Per-fixture build-time contracts for shapes the Mojo adapter
 * intentionally refuses to lower. Owned by this module (not by the
 * shared fixtures) so adding a new adapter doesn't require touching any
 * cross-adapter file. Consumed by this package's own conformance test
 * (as `expectedDiagnostics`) and by `bf compat` (issue-URL attribution).
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
  'static-array-children': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2208' },
  ],
  // `([emoji, users]) => ...` / `([id, t]) => ...` are plain array-index
  // (tuple) destructures, no rest — #2087 Phase B's `segments`-walking
  // accessor lowers both to `$__bf_item->[0]` / `$__bf_item->[1]` `my`
  // locals like any other fixed binding, so BF104 no longer fires for
  // either fixture. Each now hits a DIFFERENT, pre-existing, orthogonal
  // gap instead: the loop array (`entries`) is a function-scope local
  // const with a computed initializer
  // (`Object.entries(props.x ?? {}).filter(...)`) that the adapter can't
  // bind as a template variable — see the dedicated `arrayConst` BF101
  // check in `renderLoop`. This was always true; it was simply
  // unreachable before because BF104 refused the destructure shape first.
  'static-array-from-props': [{ code: 'BF101', severity: 'error' }],
  // The BF101 above fires; BF104 no longer does (see above), and BF103
  // (sibling-imported `<Tag>` child component in the loop body) no longer
  // does either now that the conformance harness passes
  // `siblingTemplatesRegistered: true` (#2205).
  'static-array-from-props-with-component': [{ code: 'BF101', severity: 'error' }],
  // #1310 / #2087: rest destructure in .map() callback. All four shapes
  // now lower via #2087 Phase B's `segments`-walking accessor:
  //   - object-rest read via member access (`rest-destructure-object-in-map`):
  //     `bf->omit($__bf_item, [...exclude keys...])`, `$rest->{flag}` reads
  //     the residual hashref.
  //   - object-rest spread onto the root element
  //     (`rest-destructure-object-spread-in-map`): same `bf->omit(...)`
  //     residual, forwarded via the existing `bf->spread_attrs($rest)` path.
  //   - array-rest (`rest-destructure-array-in-map`): `bf->slice($__bf_item,
  //     N, undef)` — the same runtime helper `.slice()` JS-method calls use.
  //   - nested rest inside an object pattern (`rest-destructure-nested-in-map`):
  //     the parent-prefix accessor (`$__bf_item->{cells}`) feeds the same
  //     `bf->slice(...)` call.
  // None of these are pinned here anymore.
  // `style-3-signals` / `style-object-dynamic` no longer pinned — a
  // `style={{ … }}` object literal now lowers to a CSS string with dynamic
  // values interpolated (`background-color:<%= $color %>;padding:8px`) via
  // `tryLowerStyleObject` (#1322).
  // (`tagged-template-classname` graduated by #2092 — the tag resolves
  // through the interleave-tag catalogue and desugars to an untagged
  // template literal, so it lowers like any other className template.)
  // #2038: a filter predicate containing a nested `.find(...)` callback.
  // `find*` returns an element, not a boolean — there is no inline grep
  // form, and the emitter used to degrade the call to its receiver.
  // The nested `.some` sibling (`filter-nested-callback-predicate`) is
  // NOT pinned: Mojo lowers it to a real inline Perl `grep` and must
  // render to Hono parity instead.
  // https://github.com/piconic-ai/barefootjs/issues/2038
  'filter-nested-find-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2038' },
  ],
  // #1467 demo-corpus context providers (`radio-group`, `accordion`,
  // `dialog`, `popover`, `select`, `dropdown-menu`, `combobox`,
  // `command`) are no longer pinned — an object-literal provider value
  // (`{ open: () => props.open ?? false, onOpenChange: (v) => {…} }`)
  // lowers to a Perl hashref via `parseProviderObjectLiteral` (#1897):
  // getter members snapshot their body's SSR value, handler /
  // function-shaped members lower to `undef`. The command demo's
  // `ref={(el) => {…}}` function prop on an imported component is
  // skipped at SSR like `on*` handlers.
  //
  // #1467 Phase 2e: `data-table` is no longer pinned here either — it
  // compiles clean (`selected()[index]` → `index-access`,
  // `.toFixed(2)` → `bf->to_fixed`, `/* @client */` memo SSR-folded)
  // and renders to Hono parity on real Mojolicious. The keyed-loop
  // scope-ID divergence (#1896) was fixed by the body-children
  // `inLoop` reset (loop-item children get `_bf_slot`); data-table is
  // off `skipJsx` entirely and only kept in `skipMarkerConformance`
  // below for the shared `/* @client */` keyed-map slot-id elision
  // contract (same as `todo-app`), not a render or BF101 gap.
  // #1443: `[a, b].filter(Boolean).join(' ')` (the registry Slot's
  // shape) now lowers to `join(' ', @{[grep { $_ } @{[$a, $b]}]})`.
  // No BF101 expected — pinned positively via the
  // `branch-local-filter-join` template-output test below.
  //
  // #1448 Tier A — JS Array / String methods that the Mojo adapter
  // hasn't lowered yet. Each row drops once the corresponding
  // method PR lands. Hono / CSR pass these out of the box (they
  // evaluate JS at runtime) so the pin only applies here.
  //
  // `array-includes` / `string-includes` no longer pinned — both
  // shapes lower via the shared `array-method` IR + `bf->includes`
  // runtime dispatch (#1448 Tier A first PR).
  // `array-indexOf` / `array-lastIndexOf` no longer pinned —
  // value-equality `bf->index_of` / `bf->last_index_of` helpers
  // handle the shape (#1448 Tier A second PR).
  // `array-at` no longer pinned — `bf->at` (Mojo) / `bf_at` (Go)
  // handle the negative-index lookup (#1448 Tier A third PR).
  // `array-concat` no longer pinned — `bf->concat` (Mojo) /
  // `bf_concat` (Go) merge two arrays into a new array
  // (#1448 Tier A fourth PR).
  // `array-slice` no longer pinned — `bf->slice` (Mojo) /
  // `bf_slice` (Go) carve out a sub-range with JS-compat
  // negative-index / out-of-bounds clamping (#1448 Tier A
  // fifth PR).
  // `array-reverse` / `array-toReversed` no longer pinned —
  // both share the `bf->reverse` / `bf_reverse` helper since
  // SSR templates render a snapshot and the JS mutate-vs-new
  // distinction has no template-level meaning (#1448 Tier A
  // sixth PR).
  // `string-toLowerCase` / `string-toUpperCase` no longer pinned —
  // Perl's native `lc` / `uc` (Mojo) and pre-existing
  // `bf_lower` / `bf_upper` (Go) handle the JS method names
  // (#1448 Tier A seventh + eighth PRs).
  // `string-trim` no longer pinned — pre-existing `bf_trim`
  // (Go) and new `bf->trim` helper (Mojo) handle the strip
  // (#1448 Tier A ninth PR, closing out Tier A).
  // `.find` / `.findIndex` / `.findLast` / `.findLastIndex` are no longer
  // pinned — the Mojo `callbackMethod` predicate arm now lowers them to the
  // runtime `bf->find` / `find_index` / `find_last` / `find_last_index` helpers
  // (per-element coderef predicate), matching Xslate. `.join` was never
  // pinned (handled by `renderArrayMethod`'s `case 'join'`).
  // `array-map-function-reference` no longer pinned — a bare-identifier
  // `.map(format)` callback now resolves one hop to its declaration
  // (`resolveCallbackMethodFunctionReferences`, #2206), the same mechanism
  // #2090 established for `.sort(fnref)`.
  // `dangerous-inner-html` no longer pinned — a compile-time string-literal
  // `dangerouslySetInnerHTML={{ __html: '...' }}` is spliced directly into
  // the template as trusted raw text (`resolveDangerousInnerHtml`, #2207).
  // A dynamic/signal-derived value still refuses with BF101 — see the
  // `dangerous-inner-html-dynamic` fixture/pin below (tracked: #2215).
  'dangerous-inner-html-dynamic': [{ code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2215' }],
}
