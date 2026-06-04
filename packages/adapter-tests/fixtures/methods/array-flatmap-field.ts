import { createFixture } from '../../src/types'

/**
 * `Array.prototype.flatMap(i => i.field)` — field projection (#1448 Tier C).
 *
 * Each item projects to its array-valued `tags` field, then the result is
 * flattened one level. Composed with `.join(' ')` so the gathered order is
 * visible. Go uses `bf_flat_map`; Mojo uses `bf->flat_map`.
 */
export const fixture = createFixture({
  id: 'array-flatmap-field',
  description: '.flatMap(i => i.tags) gathers and flattens a field',
  source: `
function ArrayFlatMapField({ items }: { items: { tags: string[] }[] }) {
  return <div>{items.flatMap(i => i.tags).join(' ')}</div>
}
export { ArrayFlatMapField }
`,
  props: { items: [{ tags: ['a', 'b'] }, { tags: ['c'] }, { tags: ['d', 'e'] }] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a b c d e<!--/--></div>
  `,
})
