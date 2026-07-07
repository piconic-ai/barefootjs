/**
 * MinijinjaAdapter — Conformance Tests
 *
 * Runs the shared adapter conformance corpus (JSX fixtures, template
 * primitives, marker conformance) against the minijinja adapter, rendering
 * each fixture end-to-end through real minijinja + the bundled Rust
 * `barefootjs` runtime crate via `renderMinijinjaComponent`.
 *
 * Near-verbatim port of `packages/adapter-jinja/src/__tests__/jinja-adapter.test.ts`.
 * The Jinja2 adapter was ported from the Text::Xslate (Kolon) adapter, so
 * the skip / diagnostic sets below start from adapter-jinja's (itself
 * starting from xslate's) and diverge only where the engine genuinely
 * differs — minijinja 2.21 is Jinja2-compatible for everything this adapter
 * emits (verified by an orchestrator spike; see `minijinja-adapter.ts`'s
 * file header), so NONE of adapter-jinja's pins are expected to change here.
 * Every divergence carries a one-line rationale.
 */

import { runAdapterConformanceTests } from '@barefootjs/adapter-tests'
import { MinijinjaAdapter } from '../adapter'
import { renderMinijinjaComponent, RustNotAvailableError } from '../test-render'
import { conformancePins } from '../conformance-pins'

runAdapterConformanceTests({
  name: 'minijinja',
  factory: () => new MinijinjaAdapter(),
  render: renderMinijinjaComponent,
  // Priority-12 edge-case sweep (炙り出し): fixtures below RENDER through
  // the real `bf-render` minijinja binary but diverge from the Hono
  // reference byte comparison. Each entry names its divergence;
  // graduating one means fixing the adapter (or shared compiler layer)
  // and deleting the line. (`string-concat-plus` is NOT skipped here —
  // minijinja's `+` concatenates strings, unlike Perl/PHP/Twig.)
  skipJsx: [
    // `(count() + 2) * 3` renders 10 instead of 18 — the parenthesised
    // sub-expression loses its grouping in the lowering (silent wrong
    // arithmetic; same finding as mojo/jinja/blade/twig).
    'arithmetic-text',
    // `{false}` renders "false" (Hono drops it); `{null}`/`{undefined}`
    // render empty (Hono renders "null"). Neither matches JSX semantics.
    'falsy-text-values',
    // `&copy;` in JSX literal text: Hono decodes to `©`, minijinja
    // re-emits the raw entity — same DOM, different bytes.
    'html-entity-text',
    // Math.min/max/abs over a signal render EMPTY (only Math.floor is
    // in the template-primitive registry).
    'math-methods',
    // camelCase boolean alias `readOnly`: Hono SSRs `readOnly="true"`,
    // minijinja emits bare presence.
    'boolean-attr-literals',
    // `htmlFor` is not lowered to `for` (Hono maps it).
    'camelcase-attributes',
    // Static attribute values are NOT HTML-escaped (`title="Fish &
    // Chips"` raw vs Hono's `Fish &amp; Chips`).
    'static-attr-escape',
    // SVG camelCase presentation attrs (`strokeWidth`, `strokeLinecap`)
    // pass through unmapped; Hono lowers to kebab-case.
    'svg-icon',
    // `Object.entries(prop).map(([k, v]) => …)` renders an EMPTY <ul>.
    'object-entries-map',
    // Nested-loop inner items carry `data-key` where the reference
    // emits the depth-suffixed `data-key-1`.
    'nested-loop-outer-binding',
    // JSX element as a NON-children prop renders an empty slot (the
    // element value is silently dropped).
    'jsx-element-prop',
    // `.slice()` on a STRING misfires through the array slice helper.
    'string-slice',
    // `.trimStart()` / `.trimEnd()` render empty (no lowering).
    'string-trim-sided',
  ],
  // Per-fixture build-time contracts for shapes the adapter intentionally
  // refuses to lower. Lives in `../conformance-pins` — mirrors
  // adapter-jinja's set (itself mirroring xslate's); the lowering gates
  // are shared code paths in the ported adapter (BF103/BF104 are
  // structural: cross-template child registration / destructure-loop-param
  // limits that apply identically regardless of target template language
  // or render engine).
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
    if (err instanceof RustNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})
