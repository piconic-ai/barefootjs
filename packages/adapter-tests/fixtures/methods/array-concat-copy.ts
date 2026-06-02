import { createFixture } from '../../src/types'

/**
 * `Array.prototype.concat()` with no argument (#1448 full-arity).
 *
 * JS `.concat()` returns a shallow copy. In an SSR snapshot a copy is
 * indistinguishable from the receiver, so the adapters lower it to the
 * receiver. Chained into `.join('|')` so the array is observable; the
 * conformance harness renders this through Hono / Go / Mojo and compares
 * to the real-JS `expectedHtml`.
 */
export const fixture = createFixture({
  id: 'array-concat-copy',
  description: '.concat() with no argument copies the whole array',
  source: `
function ArrayConcatCopy({ items }: { items: string[] }) {
  return <div>{items.concat().join('|')}</div>
}
export { ArrayConcatCopy }
`,
  props: { items: ['a', 'b', 'c'] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a|b|c<!--/--></div>
  `,
})
