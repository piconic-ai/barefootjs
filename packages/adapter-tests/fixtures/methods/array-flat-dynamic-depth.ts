import { createFixture } from '../../src/types'

/**
 * `Array.prototype.flat(depth)` with a DYNAMIC depth (#2094) — `depth` is a
 * numeric prop, not a literal integer / `Infinity`.
 *
 * The parser accepts a non-literal depth expression once it itself resolves
 * to a supported `ParsedExpr` (here, a plain prop read); the depth is
 * coerced at render time (JS `ToIntegerOrInfinity`). Same doubly-nested
 * input as `array-flat-depth` / `array-flat-infinity`, but the depth (`2`)
 * arrives through `depth` instead of a literal — flattening two levels
 * collapses it to scalars, same as `array-flat-depth`'s literal `.flat(2)`.
 */
export const fixture = createFixture({
  id: 'array-flat-dynamic-depth',
  description: '.flat(depth) with a dynamic (prop) depth flattens the right number of levels',
  source: `
function ArrayFlatDynamicDepth({ rows, depth }: { rows: number[][][]; depth: number }) {
  return <div>{rows.flat(depth).join(' ')}</div>
}
export { ArrayFlatDynamicDepth }
`,
  props: { rows: [[[1], [2]], [[3], [4]]], depth: 2 },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->1 2 3 4<!--/--></div>
  `,
})
