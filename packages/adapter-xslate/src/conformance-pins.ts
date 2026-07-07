/**
 * Per-fixture build-time contracts for shapes the Xslate adapter
 * intentionally refuses to lower. Mirrors mojo's set — the lowering
 * gates are shared code paths in the ported adapter. Consumed by this
 * package's own conformance test (as `expectedDiagnostics`) and by
 * `bf compat` (issue-URL attribution).
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
  // Sibling-imported child component in a loop body: emits a
  // cross-template call needing separate registration. BF103 makes
  // the requirement loud (same as mojo).
  'static-array-children': [{ code: 'BF103', severity: 'error' }],
  // TodoApp / TodoAppSSR import `TodoItem` from a sibling file and
  // call it inside a keyed `.map`. With the standalone-filter fix in
  // place these reach the SAME BF103 (imported child in `.map`) as
  // mojo — NOT BF101 — confirming the `.filter(...)` chain itself now
  // lowers and the only remaining gate is the imported-child one.
  'todo-app': [{ code: 'BF103', severity: 'error' }],
  'todo-app-ssr': [{ code: 'BF103', severity: 'error' }],
  // `([emoji, users]) => ...` / `([id, t]) => ...` are plain array-index
  // (tuple) destructures, no rest — #2087 Phase B's `segments`-walking
  // accessor lowers both to `$__bf_item[0]` / `$__bf_item[1]` `: my` locals
  // like any other fixed binding, so BF104 no longer fires for either
  // fixture. Each now hits a DIFFERENT, pre-existing, orthogonal gap
  // instead: the loop array (`entries`) is a function-scope local const
  // with a computed initializer (`Object.entries(props.x ?? {}).filter(...)`)
  // that the adapter can't bind as a template variable — see the dedicated
  // `arrayConst` BF101 check in `renderLoop`. This was always true; it was
  // simply unreachable before because BF104 refused the destructure shape
  // first.
  'static-array-from-props': [{ code: 'BF101', severity: 'error' }],
  // Both BF103 (sibling-imported `<Tag>` child component) and the BF101
  // above fire; BF104 no longer does (see above).
  'static-array-from-props-with-component': [
    { code: 'BF103', severity: 'error' },
    { code: 'BF101', severity: 'error' },
  ],
  // #1310 / #2087: rest destructure in .map() callback. All four shapes now
  // lower via #2087 Phase B's `segments`-walking accessor:
  //   - object-rest read via member access (`rest-destructure-object-in-map`):
  //     `$bf.omit($__bf_item, [...exclude keys...])`, `$rest.flag` reads the
  //     residual hashref.
  //   - object-rest spread onto the root element
  //     (`rest-destructure-object-spread-in-map`): same `$bf.omit(...)`
  //     residual, forwarded via the existing `$bf.spread_attrs($rest)` path.
  //   - array-rest (`rest-destructure-array-in-map`): `$bf.slice($__bf_item,
  //     N, nil)` — the same runtime helper `.slice()` JS-method calls use.
  //   - nested rest inside an object pattern (`rest-destructure-nested-in-map`):
  //     the parent-prefix accessor (`$__bf_item.cells`) feeds the same
  //     `$bf.slice(...)` call.
  // None of these are pinned here anymore.
  // (button/kbd graduated: the site/ui Button/Kbd `<Slot>` `{...props}` /
  // `{...children.props}` component-spread now lowers via Kolon's builtin
  // `.merge(...)` method chain — see `xslate-adapter.ts`'s
  // `renderComponent` — instead of refusing with BF101, so these two no
  // longer need a pin here.)
  // #1467 demo-corpus context providers (`radio-group`, `select`,
  // `dropdown-menu`, `combobox`, `command`) are no longer pinned — an
  // object-literal provider value (`{ value: currentValue,
  // onValueChange: (v) => {…} }`) lowers to a Kolon hashref via
  // `parseProviderObjectLiteral` (#1897): getter members snapshot
  // their body's SSR value, handler / function-shaped members lower
  // to `nil`. The command demo's `ref={(el) => {…}}` function prop on
  // an imported component is skipped at SSR like `on*` handlers.
  //
  // #1467 Phase 2e: `data-table` is no longer pinned here — it
  // compiles clean now (`selected()[index]` → `index-access`,
  // `.toFixed(2)` → `$bf.to_fixed`, `/* @client */` memo SSR-folded)
  // and renders to Hono parity on real Text::Xslate. The keyed-loop
  // scope-ID divergence (#1896) was fixed by the body-children
  // `inLoop` reset (loop-item children get `_bf_slot`); data-table is
  // off `skipJsx` entirely and only kept in `skipMarkerConformance`
  // below for the shared `/* @client */` keyed-map slot-id elision
  // contract (same as `todo-app`), not a render or BF101 gap.
  // `style-3-signals` / `style-object-dynamic` no longer pinned — a
  // `style={{ … }}` object literal now lowers to a CSS string with dynamic
  // values interpolated (`background-color:<: $color :>;padding:8px`) via
  // `tryLowerStyleObject` (#1322).
  // (`tagged-template-classname` graduated by #2092 — the tag resolves
  // through the interleave-tag catalogue and desugars to an untagged
  // template literal, so it lowers like any other className template.)
  // #2038: a filter predicate whose body contains a NESTED callback call
  // (`t => !picked().some(p => …)` / `t => picked().find(p => …)`). Kolon
  // has no inline `grep` form, so `XslateFilterEmitter.callbackMethod` used
  // to degrade the inner call to its receiver, silently changing predicate
  // semantics — the compiler is loud instead of lossy. (Mojo is pinned only
  // for the `.find` variant: it lowers a nested `.some` to a real inline
  // Perl `grep`.) The `/* @client */` twin
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
  // (text position) are NOT pinned here — unlike mojo (which refuses them),
  // Xslate lowers them to `$bf.find` / `find_index` / `find_last` /
  // `find_last_index` via the same Kolon-lambda mechanism as `.filter` /
  // `.every` / `.some`, so they render. Only the NESTED-in-a-predicate form
  // above is refused (#2038).
  // #2073 follow-up: a function-reference `.map(format)` callback has no
  // arrow body to serialize — not a CALLBACK_METHODS shape — so the
  // UNSUPPORTED_METHODS gate refuses it with BF101 rather than emitting
  // a broken template.
  'array-map-function-reference': [{ code: 'BF101', severity: 'error' }],
}
