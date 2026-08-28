import { createFixture } from '../../src/types'

/**
 * `Array.prototype.sort((a, b) => a - b)` over a primitive array —
 * the comparator's keys compare the items THEMSELVES (`SortKey.key
 * = { kind: 'self' }`), not a struct field. The field-based fixtures
 * (`array-sort-field-*`) never exercise this half of `SORT_KEY_TARGETS`,
 * so this is the `sort-target:self` denominator entry for the coverage
 * ledger's sort floor.
 */
export const fixture = createFixture({
  id: 'array-sort-self',
  description: '.sort((a,b) => a - b) sorts a primitive array by item value',
  props: { nums: [30, 10, 20] },
  source: `
function ArraySortSelf({ nums }: { nums: number[] }) {
  return <ul>{nums.sort((a, b) => a - b).map(n => <li key={n}>{n}</li>)}</ul>
}
export { ArraySortSelf }
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="10"><!--bf:s0-->10<!--/--></li>
      <li data-key="20"><!--bf:s0-->20<!--/--></li>
      <li data-key="30"><!--bf:s0-->30<!--/--></li>
    </ul>
  `,
})
