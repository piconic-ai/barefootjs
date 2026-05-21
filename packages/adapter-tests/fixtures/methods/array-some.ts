import { createFixture } from '../../src/types'

/**
 * `Array.prototype.some(pred)` — positive conformance fixture
 * (#1448 catalog parity).
 *
 * Already-lowered via the higher-order AST path. Mirror image of
 * `array-every`: the branch picks `'yes'` when at least one
 * element passes. Seeds with a mixed-sign array so a lowering that
 * required every element to pass (`.every` semantics) would render
 * `'no'`.
 */
export const fixture = createFixture({
  id: 'array-some',
  description: '.some(pred) is true when any element passes',
  source: `
function ArraySome({ items }: { items: number[] }) {
  return <div>{items.some(x => x > 0) ? 'yes' : 'no'}</div>
}
export { ArraySome }
`,
  props: { items: [-1, 2, -3] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0-->yes<!--bf-cond-end:s0--></div>
  `,
})
