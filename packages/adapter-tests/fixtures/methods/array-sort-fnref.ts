import { createFixture } from '../../src/types'

/**
 * `Array.prototype.toSorted(cmp)` where `cmp` is a bare identifier
 * reference to a module-scope `const cmp = (a, b) => ...` comparator,
 * rather than an inline arrow (#2090). The identifier is resolved
 * through the analyzer's scope machinery (one hop, same-file only) to
 * its underlying arrow, then fed through the SAME `sortComparatorFromArrow`
 * catalogue an inline comparator uses — so this fixture must produce
 * byte-identical output to `array-sort-field-asc` (the `.sort()` /
 * inline-arrow sibling), just via `.toSorted(byPrice)`.
 */
export const fixture = createFixture({
  id: 'array-sort-fnref',
  description: '.toSorted(byPrice) resolves a module-scope const arrow comparator by reference',
  source: `
const byPrice = (a, b) => a.price - b.price

function ArraySortFnRef({ items }: { items: { name: string; price: number }[] }) {
  return <ul>{items.toSorted(byPrice).map(it => <li key={it.name}>{it.name}</li>)}</ul>
}
export { ArraySortFnRef }
`,
  props: {
    items: [
      { name: 'c', price: 30 },
      { name: 'a', price: 10 },
      { name: 'b', price: 20 },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><!--bf:s0-->a<!--/--></li>
      <li data-key="b"><!--bf:s0-->b<!--/--></li>
      <li data-key="c"><!--bf:s0-->c<!--/--></li>
    </ul>
  `,
})
