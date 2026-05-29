import { createFixture } from '../../src/types'

/**
 * `Array.prototype.toSorted((a, b) => a.rank > b.rank ? 1 : -1)`
 * lowering — relational-ternary comparator (#1448 Tier B follow-up).
 * The sign-returning ternary lowers to a single `auto` comparison key:
 * the runtime compares numerically when both keys parse as numbers,
 * else lexically. With numeric `rank` values all three adapters agree
 * (Go / Mojo `auto` ⇔ the real JS `>` the Hono / CSR path emits).
 */
export const fixture = createFixture({
  id: 'array-sort-ternary',
  description: '.toSorted((a,b) => a.rank > b.rank ? 1 : -1) sorts ascending by rank',
  source: `
function ArraySortTernary({ items }: { items: { name: string; rank: number }[] }) {
  return <ul>{items.toSorted((a, b) => a.rank > b.rank ? 1 : -1).map(it => <li key={it.name}>{it.name}</li>)}</ul>
}
export { ArraySortTernary }
`,
  props: {
    items: [
      { name: 'c', rank: 3 },
      { name: 'a', rank: 1 },
      { name: 'b', rank: 2 },
    ],
  },
  // `a.rank > b.rank ? 1 : -1` is ascending by rank → a(1), b(2), c(3).
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><!--bf:s0-->a<!--/--></li>
      <li data-key="b"><!--bf:s0-->b<!--/--></li>
      <li data-key="c"><!--bf:s0-->c<!--/--></li>
    </ul>
  `,
})
