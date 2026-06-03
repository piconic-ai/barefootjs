import { createFixture } from '../../src/types'

/**
 * `Array.prototype.reduceRight((acc, x) => acc + x.field, '')` — string
 * concatenation folded right-to-left (#1448 Tier C follow-up). The fold
 * direction is the only observable difference from `.reduce`: a
 * left-to-right concat of `[a, b, c]` is `abc`, but right-to-left is
 * `cba`. Numeric sum / product commute, so this concat fixture is the
 * discriminator that pins direction across Hono/CSR, Go, and Mojo.
 */
export const fixture = createFixture({
  id: 'reduce-right-concat',
  description: ".reduceRight((acc, x) => acc + x.label, '') concatenates right-to-left",
  source: `
function ReduceRightConcat({ items }: { items: { label: string }[] }) {
  return <div>{items.reduceRight((acc, x) => acc + x.label, '')}</div>
}
export { ReduceRightConcat }
`,
  props: {
    items: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
  },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->cba<!--/--></div>
  `,
})
