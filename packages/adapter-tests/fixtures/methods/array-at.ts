import { createFixture } from '../../src/types'

/**
 * `Array.prototype.at(i)` lowering (#1448 Tier A).
 *
 * Pins the negative-index case (`-1` → last element) since that's
 * the canonical reason a JS author reaches for `.at()` over `[i]`
 * — a lowering that only handles positive indices would still pass
 * a `.at(0)` test but fail this one.
 */
export const fixture = createFixture({
  id: 'array-at',
  description: '.at(-1) returns the last element',
  source: `
function ArrayAt({ items }: { items: string[] }) {
  return <div>last: {items.at(-1)}</div>
}
export { ArrayAt }
`,
  props: { items: ['a', 'b', 'c'] },
  expectedHtml: `
    <div bf-s="test" bf="s1">last: <!--bf:s0-->c<!--/--></div>
  `,
})
