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
import { renderDivergences } from '../render-divergences'

runAdapterConformanceTests({
  name: 'minijinja',
  factory: () => new MinijinjaAdapter(),
  render: renderMinijinjaComponent,
  // Priority-12 edge-case sweep (炙り出し, #2168): render-level
  // divergences are declared in `../render-divergences` (exported from the
  // package index and published to `ui/compat.lock.json` / the docs
  // compatibility-matrix page by `packages/compat`). Deriving the skip
  // list from that object keeps the public declaration and these test
  // skips from drifting; each entry's rationale lives there.
  skipJsx: Object.keys(renderDivergences),
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
  skipDataPoints: new Set<string>(),
  onRenderError: (err, id) => {
    if (err instanceof RustNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})
