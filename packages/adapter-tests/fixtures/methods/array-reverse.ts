import { createFixture } from '../../src/types'

/**
 * `Array.prototype.reverse()` lowering (#1448 Tier A).
 *
 * JS's `.reverse()` mutates the receiver and returns it; in SSR
 * template context the receiver is immaterial (templates render a
 * snapshot) so adapters can lower it as a non-mutating reversal
 * without observable divergence. Composed with `.join(' ')` so the
 * order is visible in the rendered output.
 */
export const fixture = createFixture({
  id: 'array-reverse',
  description: '.reverse() emits the array in reverse order',
  source: `
function ArrayReverse({ items }: { items: string[] }) {
  return <div>{items.reverse().join(' ')}</div>
}
export { ArrayReverse }
`,
  props: { items: ['a', 'b', 'c'] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->c b a<!--/--></div>
  `,
})
