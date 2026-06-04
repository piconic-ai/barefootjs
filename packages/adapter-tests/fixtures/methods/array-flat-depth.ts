import { createFixture } from '../../src/types'

/**
 * `Array.prototype.flat(depth)` with an explicit depth (#1448 Tier C).
 *
 * A doubly-nested array flattened two levels collapses to scalars.
 * `.flat()` (depth 1) would leave the inner arrays intact, so the
 * explicit `2` is the discriminator for the depth-argument path.
 */
export const fixture = createFixture({
  id: 'array-flat-depth',
  description: '.flat(2) flattens two levels deep',
  source: `
function ArrayFlatDepth({ rows }: { rows: number[][][] }) {
  return <div>{rows.flat(2).join(' ')}</div>
}
export { ArrayFlatDepth }
`,
  props: { rows: [[[1], [2]], [[3], [4]]] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->1 2 3 4<!--/--></div>
  `,
})
