import { createFixture } from '../../src/types'

/**
 * `Array.prototype.reduce((acc, x) => acc * x.field, 1)` — numeric
 * product fold (#1448 Tier C). Exercises the `*` operator arm and the
 * non-zero init seed; an empty array would return the init (1), like JS.
 */
export const fixture = createFixture({
  id: 'reduce-product',
  description: '.reduce((acc, x) => acc * x.qty, 1) multiplies a numeric field',
  source: `
function ReduceProduct({ items }: { items: { qty: number }[] }) {
  return <div>{items.reduce((acc, x) => acc * x.qty, 1)}</div>
}
export { ReduceProduct }
`,
  props: {
    items: [{ qty: 2 }, { qty: 3 }, { qty: 4 }],
  },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->24<!--/--></div>
  `,
})
