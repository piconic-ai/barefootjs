/**
 * JinjaAdapter — Conformance Tests
 *
 * Runs the shared adapter conformance corpus (JSX fixtures, template
 * primitives, marker conformance) against the Jinja2 adapter, rendering
 * each fixture end-to-end through real Jinja2 + the bundled
 * `barefootjs.backend_jinja.JinjaBackend` via `renderJinjaComponent`.
 *
 * The Jinja adapter was ported from the Text::Xslate (Kolon) adapter, so
 * the skip / diagnostic sets below start from xslate's and diverge only
 * where the engine genuinely differs. Every divergence carries a one-line
 * rationale.
 */

import { runAdapterConformanceTests, TemplatePrimitiveCaseId } from '@barefootjs/adapter-tests'
import { JinjaAdapter } from '../adapter'
import { renderJinjaComponent, PythonNotAvailableError } from '../test-render'

runAdapterConformanceTests({
  name: 'jinja',
  factory: () => new JinjaAdapter(),
  render: renderJinjaComponent,
  // Per-fixture build-time contracts for shapes the Jinja adapter
  // intentionally refuses to lower. Mirrors xslate's set — the lowering
  // gates are shared code paths in the ported adapter (BF103/BF104 are
  // structural: cross-template child registration / destructure-loop-param
  // limits that apply identically regardless of target template language).
  expectedDiagnostics: {
    // Sibling-imported child component in a loop body: emits a
    // cross-template call needing separate registration. BF103 makes
    // the requirement loud (same as xslate).
    'static-array-children': [{ code: 'BF103', severity: 'error' }],
    // TodoApp / TodoAppSSR import `TodoItem` from a sibling file and
    // call it inside a keyed `.map`. Same BF103 (imported child in
    // `.map`) as xslate.
    'todo-app': [{ code: 'BF103', severity: 'error' }],
    'todo-app-ssr': [{ code: 'BF103', severity: 'error' }],
    // Array-destructure loop param (`([k, v]) => …`) can't lower to a
    // single Jinja `for` loop variable (same BF104 as xslate — Jinja's
    // `for item in list` binds one loop variable, just like Kolon's
    // `for $arr -> $item`).
    'static-array-from-props': [{ code: 'BF104', severity: 'error' }],
    // Both BF103 (imported child) and BF104 (destructure) fire.
    'static-array-from-props-with-component': [
      { code: 'BF103', severity: 'error' },
      { code: 'BF104', severity: 'error' },
    ],
    // Rest-destructure `.map()` callbacks — the object-rest shape read via
    // member access (`rest-destructure-object-in-map`) lowers via a Jinja
    // `{% set %}` local binding (same mechanism as Kolon's `: my`). The
    // other three stay refused: rest SPREAD needs a residual object,
    // array-index / nested paths can't unpack a tuple (same surface as
    // xslate).
    'rest-destructure-object-spread-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-array-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-nested-in-map': [{ code: 'BF104', severity: 'error' }],
    // The site/ui Button auto-infers a `<Slot>` sibling that spreads
    // `{...props}` / `{...children.props}` onto its root element. Jinja
    // dict literals can't splat a runtime dict into named call-site
    // entries either (same engine limitation as Kolon's hashref method
    // args), so the adapter refuses the spread with BF101 rather than
    // emit a broken render_child call. Same genuine engine divergence as
    // xslate, pinned declaratively here.
    'button': [{ code: 'BF101', severity: 'error' }],
    // `kbd` auto-infers the same `<Slot>` `{...props}` spread as `button`
    // above — refused with BF101 for the identical Jinja dict-splat
    // reason, not a render-mismatch (so it's pinned here, not in
    // `skipJsx`).
    'kbd': [{ code: 'BF101', severity: 'error' }],
    // Tagged-template-literal call in a className — same family, same
    // refusal (BF101) as xslate: the lowering pipeline can't represent a
    // tagged-template-literal call expression in Jinja.
    'tagged-template-classname': [{ code: 'BF101', severity: 'error' }],
    // #2038: a filter predicate whose body contains a NESTED callback call
    // (`t => !picked().some(p => …)` / `t => picked().find(p => …)`). Jinja
    // has no inline comprehension-with-nested-callback form usable from the
    // evaluator-JSON `*_eval` payload mechanism (this adapter's ONLY
    // higher-order-callback lowering path — see `jinja-adapter.ts`'s file
    // header, divergence 3), so the compiler is loud (BF101) instead of
    // lossy, same as xslate. The `/* @client */` twin
    // (`filter-nested-callback-predicate-client`) has no pin here: it must
    // render clean on every adapter, which asserts the suppression contract.
    // https://github.com/piconic-ai/barefootjs/issues/2038
    'filter-nested-callback-predicate': [{ code: 'BF101', severity: 'error' }],
    'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error' }],
    // NB: TOP-LEVEL `.find` / `.findIndex` / `.findLast` / `.findLastIndex`
    // (text position) are NOT pinned here — like xslate (unlike mojo, which
    // refuses them), Jinja lowers them to `bf.find_eval` / `find_index_eval`
    // / etc. via the same evaluator-JSON mechanism as `.filter` / `.every` /
    // `.some`, so they render. Only the NESTED-in-a-predicate form above is
    // refused (#2038).
  },
  // Template-primitive registry parity: same V1 surface as xslate, so the
  // same two cases stay skipped (bespoke user import + customSerialize
  // can't render server-side without user-supplied helper mappings).
  skipTemplatePrimitives: new Set([
    TemplatePrimitiveCaseId.USER_IMPORT_VIA_CONST,
    TemplatePrimitiveCaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
  ]),
  skipMarkerConformance: new Set([
    // Same as Hono / Xslate: `/* @client */` markers on TodoApp's keyed
    // `.map` intentionally elide a slot id from the SSR template that
    // the IR still declares (s6). See hono-adapter.test for the contract.
    'todo-app',
    // Same `/* @client */` keyed-map elision (data-table).
    'data-table',
  ]),
  onRenderError: (err, id) => {
    if (err instanceof PythonNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})
