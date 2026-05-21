import { createFixture } from '../../src/types'

/**
 * `Array.prototype.slice(start, end)` lowering (#1448 Tier A).
 *
 * Pinning the two-argument form (start + exclusive-end) since
 * that's the most demanding shape — a lowering that only handles
 * `.slice(start)` still passes a one-arg test but breaks here.
 * Composes with `.join(' ')` so the slice content is visible in the
 * rendered output.
 */
export const fixture = createFixture({
  id: 'array-slice',
  description: '.slice(start, end) carves out the requested sub-range',
  source: `
function ArraySlice({ items }: { items: string[] }) {
  return <div>{items.slice(1, 3).join(' ')}</div>
}
export { ArraySlice }
`,
  props: { items: ['a', 'b', 'c', 'd', 'e'] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->b c<!--/--></div>
  `,
})
