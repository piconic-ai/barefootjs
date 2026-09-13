import { createFixture } from '../src/types'

/**
 * Module-scope companion of `static-array-from-props`: a module-scope const
 * whose initializer is NOT a static literal — it's the result of a function
 * call (`buildItems()`) — mapped directly with no signal wrapper. Unlike
 * `module-const-loop-source` (whose array literal is fully known at compile
 * time and now inlines on every adapter, #2946), this shape has no
 * compile-time-known value at all: Hono renders it fine (real JS runs
 * `buildItems()` at request time), but every SSR text/struct-template
 * adapter has no way to evaluate an arbitrary function call, so each refuses
 * loudly with BF101 — the same #2321 design gap as an unresolvable
 * FUNCTION-scope const (`static-array-from-props`), now applied uniformly
 * regardless of which scope the const lives in (see the
 * `resolveStaticLoopSource` fix in `packages/jsx/src/static-literal.ts` and
 * each adapter's `renderLoop` guard).
 */
export const fixture = createFixture({
  id: 'module-const-loop-source-computed',
  description: 'A module-scope const computed via a function call refuses loudly (BF101) on every SSR template adapter (#2321)',
  escapes: [
    { kind: 'prop-precompute', fixture: 'module-const-loop-source-computed-precomputed' },
    { kind: 'client-directive', fixture: 'module-const-loop-source-computed-client' },
  ],
  source: `
'use client'

function buildItems() {
  return ['a', 'b', 'c']
}

const items = buildItems()

export function ModuleConstLoopSourceComputed() {
  return (
    <div className="container">
      {items.map(item => (
        <div key={item} data-item={item}>row {item}</div>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2" class="container">
      <div bf="s1" data-item="a" data-key="a">row <!--bf:s0-->a<!--/--></div>
      <div bf="s1" data-item="b" data-key="b">row <!--bf:s0-->b<!--/--></div>
      <div bf="s1" data-item="c" data-key="c">row <!--bf:s0-->c<!--/--></div>
    </div>
  `,
})
