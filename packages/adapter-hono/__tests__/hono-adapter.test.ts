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

runAdapterConformanceTests({
  name: 'hono',
  factory: () => new HonoAdapter(),
  render: renderHonoComponent,
  // Hono's SSR runtime is JS — broad `acceptsTemplateCall` covers
  // every conformance case.
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
