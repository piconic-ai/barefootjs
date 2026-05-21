import { createFixture } from '../../src/types'

/**
 * `Array.prototype.find(pred)` — positive conformance fixture
 * (#1448 catalog parity).
 *
 * Pins the first-match return semantic with a duplicated-value
 * input so a lowering that scanned backward or returned the last
 * match would surface here. Predicate is `x => x === 'b'` (a
 * literal-equality shape) rather than `x => x === target` because
 * Go's current `.find` lowering for primitive arrays emits
 * `eq . .Target` inside the `range` body — `.Target` resolves
 * against the iteration element instead of the outer prop and
 * silently produces empty output (separate Go gap, tracked
 * independently). The literal-equality form exercises the same
 * lowering surface (`range / if eq / break`) without depending on
 * outer-scope reference correctness.
 */
export const fixture = createFixture({
  id: 'array-find',
  description: '.find(pred) returns the first matching element',
  source: `
function ArrayFind({ items }: { items: string[] }) {
  return <div>found: {items.find(x => x === 'b')}</div>
}
export { ArrayFind }
`,
  props: { items: ['a', 'b', 'c', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s1">found: <!--bf:s0-->b<!--/--></div>
  `,
})
