/**
 * XslateAdapter — Conformance Tests
 *
 * Runs the shared adapter conformance corpus (JSX fixtures, template
 * primitives, marker conformance) against the Text::Xslate (Kolon)
 * adapter, rendering each fixture end-to-end through real Text::Xslate +
 * `BarefootJS::Backend::Xslate` via `renderXslateComponent`.
 *
 * The Xslate adapter was ported from the Mojolicious adapter and shares
 * its Perl-scoping + SSR-context limitations, so the skip / diagnostic
 * sets below start from mojo's and diverge only where the engine
 * genuinely differs. Every divergence carries a one-line rationale.
 */

import {
  runAdapterConformanceTests,
  TemplatePrimitiveCaseId,
} from '@barefootjs/adapter-tests'
import { XslateAdapter } from '../adapter'
import { renderXslateComponent, XslateNotAvailableError } from '../test-render'

runAdapterConformanceTests({
  name: 'xslate',
  factory: () => new XslateAdapter(),
  render: renderXslateComponent,
  // Skips here are VERIFIED, not inherited from mojo. Notably, the six
  // fixtures mojo skips for Perl-EP scoping faults — `logical-or-jsx`,
  // `nullish-coalescing-jsx`, `branch-map`, `return-logical-or`,
  // `return-nullish-coalescing`, `return-map` (bare `$label` / `$items`
  // without a `my` binding) — all PASS on Xslate, because Kolon resolves
  // `$label` from the per-render vars rather than a Perl lexical, so there
  // is no undefined-symbol fault. Xslate therefore skips strictly fewer
  // fixtures than mojo. Each entry below was confirmed to fail with
  // skipJsx emptied.
  skipJsx: [
    // SSR context propagation (`<Ctx.Provider value>` → `useContext`): the
    // template reads a stash key that's never seeded. Implemented on Go; the
    // Perl stash-seed path is a follow-up port, so Xslate stays skipped (#1297).
    'context-provider',
    // `toggle-shared`: the parent maps a `ToggleItemProps[]` prop into
    // sibling `ToggleItem` children inside a keyed `.map`. Three gaps
    // remain (same as mojo): the loop-child `on = props.defaultOn ??
    // false` signal isn't seeded server-side (so every item renders OFF
    // instead of honouring per-item `defaultOn`), the child scope id is
    // the snake-case `toggle_item_<rand>` rather than the `ToggleItem_*`
    // PascalCase the reference pins, and `key=` → `data-key` isn't
    // emitted. Kolon resolves the unseeded vars to nil rather than
    // aborting, so this surfaces as a render mismatch (not a hard error).
    // Separate follow-up.
    'toggle-shared',
    // `props-reactivity-comparison` (the `PropsReactivityComparison`
    // export of `ReactiveProps.tsx`): componentName selection is now
    // honoured, but the child `PropsStyleChild`'s `displayValue =
    // props.value * 10` memo has no static SSR default
    // (`extractSsrDefaults` → `null` for a prop-derived expression) and
    // the Perl SSR model seeds child memos from static defaults. Kolon
    // renders the unseeded `$displayValue` as empty, so `child-computed-
    // value` is blank where Hono / Go emit `10` (Go computes it in a
    // generated child constructor — the Perl static path has no
    // equivalent). (Same reason mojo skips.)
    'props-reactivity-comparison',
    // (`kbd` is not skipped here — it's a BF101 refusal pinned in
    // `expectedDiagnostics` below, not a render-mismatch.)
  ],
  // Per-fixture build-time contracts for shapes the Xslate adapter
  // intentionally refuses to lower. Mirrors mojo's set — the lowering
  // gates are shared code paths in the ported adapter.
  expectedDiagnostics: {
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
    // Array-destructure loop param (`([k, v]) => …`) can't lower to a
    // single Kolon loop variable (same BF104 as mojo).
    'static-array-from-props': [{ code: 'BF104', severity: 'error' }],
    // Both BF103 (imported child) and BF104 (destructure) fire.
    'static-array-from-props-with-component': [
      { code: 'BF103', severity: 'error' },
      { code: 'BF104', severity: 'error' },
    ],
    // Rest-destructure `.map()` callbacks — the loop emitter raises the
    // generic BF104 destructure refusal regardless of rest-vs-plain
    // (same surface as mojo).
    'rest-destructure-object-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-object-spread-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-array-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-nested-in-map': [{ code: 'BF104', severity: 'error' }],
    // XSLATE-SPECIFIC (mojo passes this): the site/ui Button auto-infers a
    // `<Slot>` sibling that spreads `{...props}` / `{...children.props}`
    // onto its root element. Kolon hashref method args can't splat a
    // runtime hash into named entries (no `%$h`-into-call-args form), so
    // the adapter refuses the spread with BF101 rather than emit a broken
    // render_child call. Mojo's EP `%= include` accepts a flat stash, so it
    // lowers the same shape; this is a genuine engine divergence, pinned
    // declaratively here.
    'button': [{ code: 'BF101', severity: 'error' }],
    // `kbd` auto-infers the same `<Slot>` `{...props}` spread as `button`
    // above — refused with BF101 for the identical Kolon engine reason, not a
    // render-mismatch (so it's pinned here, not in `skipJsx`).
    'kbd': [{ code: 'BF101', severity: 'error' }],
    // JS object literal in an attribute value (`style={{ … }}`) has no
    // Kolon form — refused via the same gate as mojo (BF101).
    'style-3-signals': [{ code: 'BF101', severity: 'error' }],
    // Dynamic `style={{ … }}` object: the Xslate adapter cleanly refuses it
    // with BF101 (no idiomatic Kolon form). mojo *skips* this fixture because
    // its EP path emits invalid Perl silently — Xslate's build-time diagnostic
    // is the stronger contract, so it's pinned here rather than skipped.
    'style-object-dynamic': [{ code: 'BF101', severity: 'error' }],
    // Tagged-template-literal call in a className — same family, same
    // refusal (BF101).
    'tagged-template-classname': [{ code: 'BF101', severity: 'error' }],
    // NB: `.find` / `.findIndex` / `.findLast` / `.findLastIndex` are NOT
    // pinned here — unlike mojo (which refuses them), Xslate lowers them to
    // `$bf.find` / `find_index` / `find_last` / `find_last_index` via the same
    // Kolon-lambda mechanism as `.filter` / `.every` / `.some`, so they render.
  },
  // Template-primitive registry parity: same V1 surface as mojo, so the
  // same two cases stay skipped (bespoke user import + customSerialize
  // can't render server-side without user-supplied helper mappings).
  skipTemplatePrimitives: new Set([
    TemplatePrimitiveCaseId.USER_IMPORT_VIA_CONST,
    TemplatePrimitiveCaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
  ]),
  // Loop boundary markers for `@client` loops aren't emitted by the
  // Xslate adapter yet (ported from mojo, which skips the same set).
  skipMarkerConformance: new Set([
    'client-only',
    'client-only-loop-with-sibling-cond',
    'todo-app',
  ]),
  onRenderError: (err, id) => {
    if (err instanceof XslateNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})
