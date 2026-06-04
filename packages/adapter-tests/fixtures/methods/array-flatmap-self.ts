import { createFixture } from '../../src/types'

/**
 * `Array.prototype.flatMap(i => i)` — self projection (#1448 Tier C).
 *
 * flatMap with the identity callback is equivalent to `.flat(1)`: each
 * nested array is flattened one level. Composed with `.join(' ')`.
 */
export const fixture = createFixture({
  id: 'array-flatmap-self',
  description: '.flatMap(i => i) flattens one level (identity)',
  source: `
function ArrayFlatMapSelf({ rows }: { rows: number[][] }) {
  return <div>{rows.flatMap(i => i).join(' ')}</div>
}
export { ArrayFlatMapSelf }
`,
  props: { rows: [[1, 2], [3], [4, 5]] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->1 2 3 4 5<!--/--></div>
  `,
})
