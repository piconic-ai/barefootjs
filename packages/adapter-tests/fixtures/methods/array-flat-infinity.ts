import { createFixture } from '../../src/types'

/**
 * `Array.prototype.flat(Infinity)` — full-depth flatten (#1448 Tier C).
 *
 * `Infinity` lowers to the `-1` sentinel the runtime helpers read as
 * "flatten fully". The same doubly-nested input as `array-flat-depth`
 * collapses to scalars regardless of how deep the nesting goes.
 */
export const fixture = createFixture({
  id: 'array-flat-infinity',
  description: '.flat(Infinity) flattens all levels',
  source: `
function ArrayFlatInfinity({ rows }: { rows: number[][][] }) {
  return <div>{rows.flat(Infinity).join(' ')}</div>
}
export { ArrayFlatInfinity }
`,
  props: { rows: [[[1], [2]], [[3], [4]]] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->1 2 3 4<!--/--></div>
  `,
})
