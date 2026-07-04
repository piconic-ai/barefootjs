import { createFixture } from '../../src/types'

/**
 * `Array.prototype.flatMap(p => p.tags.map(t => '#' + t)).join(' ')` — the
 * #1938 blog-showcase shape, and the motivating case for the evaluator's
 * nested-callback widening (#2094): the flatMap projection body itself
 * contains a `.map(cb)` call, which the runtime evaluator now serializes
 * (recursively) instead of refusing.
 *
 * Each post's `tags` maps to `#`-prefixed strings; flatMap gathers and
 * flattens the per-post arrays one level, then `.join(' ')` renders them.
 */
export const fixture = createFixture({
  id: 'array-flatmap-nested-map',
  description: ".flatMap(p => p.tags.map(t => '#' + t)) — nested .map inside the flatMap projection",
  source: `
function ArrayFlatMapNestedMap({ posts }: { posts: { tags: string[] }[] }) {
  return <div>{posts.flatMap(p => p.tags.map(t => '#' + t)).join(' ')}</div>
}
export { ArrayFlatMapNestedMap }
`,
  props: { posts: [{ tags: ['go', 'perl'] }, { tags: ['rust'] }] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->#go #perl #rust<!--/--></div>
  `,
})
