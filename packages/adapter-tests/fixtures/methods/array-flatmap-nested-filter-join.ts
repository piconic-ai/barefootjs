import { createFixture } from '../../src/types'

/**
 * `Array.prototype.flatMap(i => i.tags.filter(t => t !== 'x')).join(',')` —
 * nested `.filter` + `.join` composed INSIDE a flatMap projection body
 * (#2094). Both are new evaluator-subset members: `.filter(cb)` serializes
 * recursively (the callback body is itself in the subset), and `.join(sep?)`
 * is a plain `array-method` the evaluator now executes directly.
 *
 * Each item's `tags` drops the excluded value, flatMap gathers + flattens
 * the per-item arrays one level, then the OUTER `.join(',')` renders them.
 */
export const fixture = createFixture({
  id: 'array-flatmap-nested-filter-join',
  description: ".flatMap(i => i.tags.filter(...)) — nested .filter inside the flatMap projection",
  source: `
function ArrayFlatMapNestedFilterJoin({ items }: { items: { tags: string[] }[] }) {
  return <div>{items.flatMap(i => i.tags.filter(t => t !== 'x')).join(',')}</div>
}
export { ArrayFlatMapNestedFilterJoin }
`,
  props: { items: [{ tags: ['a', 'x', 'b'] }, { tags: ['x'] }, { tags: ['c', 'd'] }] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a,b,c,d<!--/--></div>
  `,
})
