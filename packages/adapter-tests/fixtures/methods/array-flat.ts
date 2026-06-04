import { createFixture } from '../../src/types'

/**
 * `Array.prototype.flat()` lowering (#1448 Tier C).
 *
 * `.flat()` with no argument flattens one level. Composed with
 * `.join(' ')` so the flattened order is visible in the rendered
 * output. Go uses `bf_flat`; Mojo uses `bf->flat`.
 */
export const fixture = createFixture({
  id: 'array-flat',
  description: '.flat() flattens one level',
  source: `
function ArrayFlat({ rows }: { rows: number[][] }) {
  return <div>{rows.flat().join(' ')}</div>
}
export { ArrayFlat }
`,
  props: { rows: [[1, 2], [3, 4]] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->1 2 3 4<!--/--></div>
  `,
})
