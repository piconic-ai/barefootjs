import { createFixture } from '../../src/types'

/**
 * `Array.prototype.reduce((a, b) => a + b, 0)` — numeric sum over a
 * primitive array (the `self` key, #1448 Tier C). Exercises the
 * `key.kind === 'self'` projection path (no struct-field lookup) on
 * both runtime helpers.
 */
export const fixture = createFixture({
  id: 'reduce-sum-self',
  description: '.reduce((a, b) => a + b, 0) sums a primitive array',
  source: `
function ReduceSumSelf({ nums }: { nums: number[] }) {
  return <div>{nums.reduce((a, b) => a + b, 0)}</div>
}
export { ReduceSumSelf }
`,
  props: { nums: [10, 20, 30, 5] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->65<!--/--></div>
  `,
})
