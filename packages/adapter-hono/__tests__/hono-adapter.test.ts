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
})
