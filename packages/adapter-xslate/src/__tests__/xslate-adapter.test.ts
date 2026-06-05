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
  // The Xslate adapter shares the Mojo adapter's Perl-scoping and
  // SSR-context limitations (it was ported from it). These fixtures
  // reference a prop / signal directly inside a conditional or return
  // branch without a `my $x = …` declaration, so the engine rejects the
  // template with an undefined-variable fault — the same divergence
  // class mojo skips. Out of scope for the conformance port.
  skipJsx: [
    // Dynamic JS object literal in a `style={{…}}` attribute has no
    // idiomatic Kolon form (mojo skips for the same reason).
    'style-object-dynamic',
    // Prop referenced directly inside a conditional / return branch
    // (`$label`, `$banner`, `$active`) without a binding — same
    // Perl-scoping divergence mojo skips.
    'logical-or-jsx',
    'nullish-coalescing-jsx',
    'branch-map',
    'return-logical-or',
    'return-nullish-coalescing',
    'return-map',
    // No SSR context-propagation mechanism: `<Ctx.Provider value="dark">`
    // doesn't make `useContext(Ctx)` resolve at template-eval time. Same
    // adapter-feature gap mojo skips.
    'context-provider',
    // Multi-component shared-state fixtures: the Toggle/ToggleItem and
    // props-reactivity pairs render their children inside a keyed `.map`
    // (loop children, so no `_bf_slot`), where the harness derives a
    // non-deterministic `<child>_<rand>` scope id instead of the
    // canonical `<ChildName>_*` the reference HTML pins, and the loop
    // body's per-item reactive state isn't seeded server-side. Same
    // test-harness scope-id + shared-state divergence the Mojo suite
    // skips for this pair. (Single-component `reactive-props` passes.)
    'toggle-shared',
    'props-reactivity-comparison',
    // #1467 Phase 2b interactive `site/ui` primitives — cross-adapter
    // parity is a later phase; these participate only in Hono SSR
    // conformance for now (mojo skips identically).
    'toggle',
    'switch',
    'checkbox',
    'textarea',
    'kbd',
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
    // JS object literal in an attribute value (`style={{ … }}`) has no
    // Kolon form — refused via the same gate as mojo (BF101).
    'style-3-signals': [{ code: 'BF101', severity: 'error' }],
    // Tagged-template-literal call in a className — same family, same
    // refusal (BF101).
    'tagged-template-classname': [{ code: 'BF101', severity: 'error' }],
    // `.find` / `.findIndex` / `.findLast` / `.findLastIndex` have no
    // Kolon lowering yet (mojo refuses these too). The standalone
    // `.filter` / `.every` / `.some` shapes are NOT pinned here — they
    // now lower to `grep_filter` / `grep_every` / `grep_some` Kolon
    // functions.
    'array-find':          [{ code: 'BF101', severity: 'error' }],
    'array-findIndex':     [{ code: 'BF101', severity: 'error' }],
    'array-findLast':      [{ code: 'BF101', severity: 'error' }],
    'array-findLastIndex': [{ code: 'BF101', severity: 'error' }],
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
