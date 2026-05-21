import { createFixture } from '../../src/types'

/**
 * `Array.prototype.findIndex(pred)` — positive conformance fixture
 * (#1448 catalog parity).
 *
 * Predicate is `x => x === 'b'` (literal-equality) for the same
 * reason as the `array-find` sibling — see that fixture's comment
 * for the Go primitive-array scope gap that the literal form
 * sidesteps. The duplicated-value input with the first match at a
 * non-zero index disambiguates `findIndex` from both `find`
 * (returns value, not index) and `lastIndexOf` (returns last
 * position, not first).
 */
export const fixture = createFixture({
  id: 'array-findIndex',
  description: '.findIndex(pred) returns the index of the first match',
  source: `
function ArrayFindIndex({ items }: { items: string[] }) {
  return <div>idx: {items.findIndex(x => x === 'b')}</div>
}
export { ArrayFindIndex }
`,
  props: { items: ['a', 'b', 'c', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s1">idx: <!--bf:s0-->1<!--/--></div>
  `,
})
