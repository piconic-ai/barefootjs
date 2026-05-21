import { createFixture } from '../../src/types'

/**
 * `Array.prototype.join(sep)` — positive conformance fixture
 * (#1448 catalog parity with the BF101-pinned Tier A entries).
 *
 * Already-lowered today (`bf_join` in Go, `join(...)` in Mojo); the
 * fixture pins the rendered surface so a regression in any adapter
 * surfaces here instead of silently breaking downstream fixtures
 * that compose `.join` (`branch-local-filter-join`,
 * `rest-destructure-array-in-map`, etc.). Uses a non-default
 * separator ` - ` so a lowering that hard-codes the JS default
 * `,` would still fail the assertion.
 */
export const fixture = createFixture({
  id: 'array-join',
  description: '.join(sep) joins elements with the separator',
  source: `
function ArrayJoin({ items }: { items: string[] }) {
  return <div>{items.join(' - ')}</div>
}
export { ArrayJoin }
`,
  props: { items: ['a', 'b', 'c'] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a - b - c<!--/--></div>
  `,
})
