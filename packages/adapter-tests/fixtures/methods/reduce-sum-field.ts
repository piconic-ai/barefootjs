import { createFixture } from '../../src/types'

/**
 * `Array.prototype.reduce((acc, x) => acc + x.field, 0)` — numeric
 * sum over a struct field (#1448 Tier C). The arithmetic-fold
 * catalogue's flagship shape: it's the form that recurs across the
 * demo components (`playlist.reduce((s, t) => s + t.duration, 0)`,
 * view-count / visitor sums, …). Lowers via the `array-method` +
 * `ReduceOp` IR + the `bf_reduce` (Go) / `bf->reduce` (Mojo) runtime
 * helpers. Integer sums render byte-equal across Hono / CSR / Go / Mojo.
 */
export const fixture = createFixture({
  id: 'reduce-sum-field',
  description: '.reduce((s, t) => s + t.duration, 0) sums a numeric field',
  source: `
function ReduceSumField({ items }: { items: { duration: number }[] }) {
  return <div>{items.reduce((sum, t) => sum + t.duration, 0)}</div>
}
export { ReduceSumField }
`,
  props: {
    items: [{ duration: 95 }, { duration: 213 }, { duration: 185 }],
  },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->493<!--/--></div>
  `,
})
