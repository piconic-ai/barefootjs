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

import { runAdapterConformanceTests } from '@barefootjs/adapter-tests'
import { JinjaAdapter } from '../adapter'
import { renderJinjaComponent, PythonNotAvailableError } from '../test-render'
import { conformancePins } from '../conformance-pins'

runAdapterConformanceTests({
  name: 'jinja',
  factory: () => new JinjaAdapter(),
  render: renderJinjaComponent,
  // Priority-12 edge-case sweep (炙り出し): fixtures below RENDER on real
  // Python jinja2 but diverge from the Hono reference byte comparison.
  // Each entry names its divergence; graduating one means fixing the
  // adapter (or shared compiler layer) and deleting the line.
  skipJsx: [
    // `(count() + 2) * 3` renders 10 instead of 18 — the parenthesised
    // sub-expression loses its grouping in the lowering, so the output
    // silently computes `count() + 2 * 3`. Highest-priority finding of
    // the sweep for this adapter (silent wrong arithmetic).
    'arithmetic-text',
    // `{false}` renders "false" (Hono drops it); `{null}`/`{undefined}`
    // render empty (Hono renders "null"). Neither matches JSX semantics.
    'falsy-text-values',
    // `&copy;` in JSX literal text: Hono decodes to `©`, Jinja re-emits
    // the raw entity — same DOM, different bytes.
    'html-entity-text',
    // Math.min/max/abs over a signal render EMPTY (only Math.floor is
    // in the template-primitive registry).
    'math-methods',
    // camelCase boolean alias `readOnly`: Hono SSRs `readOnly="true"`,
    // Jinja emits bare presence.
    'boolean-attr-literals',
    // `htmlFor` is not lowered to `for` (Hono maps it).
    'camelcase-attributes',
    // Static attribute values are NOT HTML-escaped (`title="Fish &
    // Chips"` raw vs Hono's `Fish &amp; Chips`).
    'static-attr-escape',
    // SVG camelCase presentation attrs (`strokeWidth`, `strokeLinecap`)
    // pass through unmapped; Hono lowers to kebab-case.
    'svg-icon',
    // `Object.entries(prop).map(([k, v]) => …)` renders an EMPTY <ul> —
    // the object-shaped prop silently produces zero iterations.
    'object-entries-map',
    // Nested-loop inner items carry `data-key` where the reference
    // emits the depth-suffixed `data-key-1`.
    'nested-loop-outer-binding',
    // JSX element as a NON-children prop renders an empty slot (the
    // element value is silently dropped).
    'jsx-element-prop',
    // `.slice()` on a STRING renders empty (array-slice helper misfires
    // on strings).
    'string-slice',
    // `.trimStart()` / `.trimEnd()` render empty (no lowering).
    'string-trim-sided',
  ],
  // Per-fixture build-time contracts for shapes the Jinja adapter
  // intentionally refuses to lower. Lives in `../conformance-pins` —
  // mirrors xslate's set (the lowering gates are shared code paths in
  // the ported adapter; BF103/BF104 are structural: cross-template
  // child registration / destructure-loop-param limits that apply
  // identically regardless of target template language).
  expectedDiagnostics: conformancePins,
  // Template-primitive registry: `USER_IMPORT_VIA_CONST` and
  // `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` now pass (#2069) — a bespoke user
  // import can never be added to the string-keyed registry, but the
  // shared `RelocateEnv.loweringMatchers` acceptance path recognises it
  // via a `LoweringPlugin` the case setup registers around the compile
  // (see `packages/adapter-tests/src/cases/template-primitives.ts`). No
  // skips left, so `skipTemplatePrimitives` is omitted entirely.
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
