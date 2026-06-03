import { createFixture } from '../../src/types'

/**
 * `Array.prototype.reduce((acc, x) => acc + x.field, '')` — string
 * concatenation fold (#1448 Tier C). A string init flips the `+` fold
 * to concatenation; the runtime helpers stringify each projected key
 * (undef → '') and append in order, preserving the left-to-right
 * accumulation JS guarantees.
 */
export const fixture = createFixture({
  id: 'reduce-concat',
  description: ".reduce((acc, x) => acc + x.label, '') concatenates a string field",
  source: `
function ReduceConcat({ items }: { items: { label: string }[] }) {
  return <div>{items.reduce((acc, x) => acc + x.label, '')}</div>
}
export { ReduceConcat }
`,
  props: {
    items: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
  },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->abc<!--/--></div>
  `,
})
