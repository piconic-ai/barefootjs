import { createFixture } from '../../src/types'

/**
 * `Array.prototype.every(pred)` — positive conformance fixture
 * (#1448 catalog parity).
 *
 * Already-lowered via the higher-order AST path. The branch picks
 * `'all'` only when every element satisfies the predicate, so a
 * lowering that flipped truthy / falsy semantics (returning
 * true on first failure instead of true on all-pass) renders
 * `'mixed'` and fails the assertion.
 */
export const fixture = createFixture({
  id: 'array-every',
  description: '.every(pred) is true when every element passes',
  source: `
function ArrayEvery({ items }: { items: number[] }) {
  return <div>{items.every(x => x > 0) ? 'all' : 'mixed'}</div>
}
export { ArrayEvery }
`,
  props: { items: [1, 2, 3] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0-->all<!--bf-cond-end:s0--></div>
  `,
})
