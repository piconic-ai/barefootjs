import { createFixture } from '../../src/types'

/**
 * `Array.prototype.concat(other)` lowering (#1448 Tier A).
 *
 * Composes with `.join(' ')` so the rendered output reflects the
 * concatenation order. Using `.join` (already supported via the
 * `array-method` IR added in #1443) lets us assert that the
 * concatenation result is a real iterable, not a stringified
 * `[object Object]` from a wrong lowering.
 */
export const fixture = createFixture({
  id: 'array-concat',
  description: '.concat(other) merges two arrays in order',
  source: `
function ArrayConcat({ left, right }: { left: string[]; right: string[] }) {
  return <div>{left.concat(right).join(' ')}</div>
}
export { ArrayConcat }
`,
  props: { left: ['a', 'b'], right: ['c', 'd'] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a b c d<!--/--></div>
  `,
})
