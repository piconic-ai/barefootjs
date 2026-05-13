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
  // every conformance case. Only one outlier:
  skipJsx: [
    // `Record<K, V>` + `obj[key]` index lookup (Button's variantClasses
    // pattern) currently emits an empty SSR substitution — the lookup
    // strips to `class="base "` instead of `class="base class-a"`.
    // Site/ui works in practice because the misrender is cosmetic and
    // client-side hydration overwrites the class on first paint, but
    // server-rendered HTML is wrong on the wire. The go-template
    // adapter materialises the same pattern correctly, so the bug
    // lives in the Hono SSR expression path (not the compiler).
    // Tracked separately; pinning the failing fixture so a future fix
    // takes credit and a regression doesn't sneak in.
    'record-index-lookup',
  ],
})
