import { createFixture } from '../../src/types'

/**
 * `Array.prototype.sort((a, b) => a.x - b.x || a.y.localeCompare(b.y))`
 * lowering — multi-key (`||`-chained) comparator (#1448 Tier B
 * follow-up). Each `||` operand becomes one comparison key applied in
 * priority order: a tie on `price` falls through to `name`. Lowers to
 * one 4-string `bf_sort` group per key (Go) / one `keys` hash per key
 * (Mojo); the Hono / CSR path re-emits the raw `||` comparator into
 * `.toSorted(...)` so real JS evaluates it.
 */
export const fixture = createFixture({
  id: 'array-sort-multikey',
  description: '.sort((a,b) => a.price - b.price || a.name.localeCompare(b.name)) sorts by price, then name',
  source: `
function ArraySortMultiKey({ items }: { items: { name: string; price: number }[] }) {
  return <ul>{items.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name)).map(it => <li key={it.name}>{it.name}</li>)}</ul>
}
export { ArraySortMultiKey }
`,
  props: {
    items: [
      { name: 'c', price: 10 },
      { name: 'a', price: 10 },
      { name: 'b', price: 20 },
    ],
  },
  // price asc orders [10, 10, 20]; the price=10 tie breaks on name asc
  // (a before c), so the rendered order is a, c, b.
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><!--bf:s0-->a<!--/--></li>
      <li data-key="c"><!--bf:s0-->c<!--/--></li>
      <li data-key="b"><!--bf:s0-->b<!--/--></li>
    </ul>
  `,
})
