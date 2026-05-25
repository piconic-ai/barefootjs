import { createFixture } from '../../src/types'

/**
 * `Array.prototype.findLastIndex(pred)` — positive conformance fixture
 * (#1448 Tier B).
 *
 * Predicate is `x => x === 'b'` (literal-equality) for the same
 * reason as the `array-find` sibling — see that fixture's comment.
 * Input `['a', 'b', 'c', 'b']` has `'b'` at indices 1 and 3;
 * `.findLastIndex` must return `3` (the last position), not `1`
 * (which `.findIndex` returns).
 */
export const fixture = createFixture({
  id: 'array-findLastIndex',
  description: '.findLastIndex(pred) returns the index of the last match',
  source: `
function ArrayFindLastIndex({ items }: { items: string[] }) {
  return <div>idx: {items.findLastIndex(x => x === 'b')}</div>
}
export { ArrayFindLastIndex }
`,
  props: { items: ['a', 'b', 'c', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s1">idx: <!--bf:s0-->3<!--/--></div>
  `,
})
