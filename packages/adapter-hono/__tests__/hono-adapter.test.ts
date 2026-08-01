/**
 * Hono Adapter Tests
 *
 * Single mandatory `runAdapterConformanceTests` call below covers every
 * shared conformance suite the adapter contract defines today and any
 * future ones added to that function.
 */

import { HonoAdapter } from '../src/adapter'
import { runAdapterConformanceTests } from '@barefootjs/adapter-tests'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { conformancePins } from '../src/conformance-pins'

runAdapterConformanceTests({
  name: 'hono',
  factory: () => new HonoAdapter(),
  render: renderHonoComponent,
  // Hono's SSR runtime is JS — broad `acceptsTemplateCall` covers
  // every conformance case. `conformancePins` is empty (no pins) but
  // still wired through for uniformity with the other 7 adapters.
  expectedDiagnostics: conformancePins,
  // Correct-output fixtures Hono itself cannot pass yet. Hono is the
  // reference adapter, so these fixtures' `expectedHtml` is hand-authored
  // to the correct output instead of generated from Hono (each fixture's
  // docstring explains). Graduating an entry = fixing the emission,
  // regenerating `expectedHtml` from the fixed reference, and deleting
  // the line here (plus the matching render-divergences entries in the
  // other adapter packages).
  skipJsx: [
    // Aliased destructured prop `{ n: count }` loses its rename in the
    // emitted destructure, so the aliased prop is always `undefined`.
    // https://github.com/piconic-ai/barefootjs/issues/2460
    'aliased-destructured-prop',
    // `<select value={sig()}>` SSRs an invalid `value` attribute instead
    // of `selected` on the matching option.
    // https://github.com/piconic-ai/barefootjs/issues/2464
    'select-value-ssr',
    // `<textarea value={sig()}>` SSRs a `value` attribute instead of
    // element content.
    // https://github.com/piconic-ai/barefootjs/issues/2465
    'textarea-value-ssr',
  ],
  skipMarkerConformance: new Set<string>([
    // TodoApp's keyed `.map` carries a `/* @client */` marker, which
    // the compiler intentionally elides on the SSR side (loop body
    // materialises at hydrate time). Marker conformance then sees
    // one fewer slot id in the SSR template than the IR declares
    // (s6 in this case). Real compiler contract, not drift — pin
    // the gap here until the marker checker learns about
    // client-only loops.
    'todo-app',
    // #1467 Phase 2e: DataTablePreviewDemo's keyed `.map` over the
    // `/* @client */`-sorted memo elides its slot id from the SSR
    // template the same way TodoApp's does.
    'data-table',
  ]),
})
