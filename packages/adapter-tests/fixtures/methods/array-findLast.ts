import { createFixture } from '../../src/types'

/**
 * `Array.prototype.findLast(pred)` — positive conformance fixture
 * (#1448 Tier B).
 *
 * Pins the last-match return semantic with a duplicated-value input
 * so a lowering that returned the first match would surface here.
 * Predicate is `x => x === 'b'` (literal-equality) for the same
 * reason as the `array-find` sibling — see that fixture's comment.
 * Input `['a', 'b', 'c', 'b']` has `'b'` at indices 1 and 3;
 * `.findLast` must return the occurrence at index 3.
 */
export const fixture = createFixture({
  id: 'array-findLast',
  description: '.findLast(pred) returns the last matching element',
  source: `
function ArrayFindLast({ items }: { items: string[] }) {
  return <div>found: {items.findLast(x => x === 'b')}</div>
}
export { ArrayFindLast }
`,
  props: { items: ['a', 'b', 'c', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s1">found: <!--bf:s0-->b<!--/--></div>
  `,
})
