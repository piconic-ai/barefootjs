import { createFixture } from '../../src/types'

/**
 * `Array.prototype.indexOf(x)` lowering (#1448 Tier A).
 *
 * Returns -1 when the value is absent and a 0-based position when
 * present. Pinning a non-zero positive index avoids ambiguity with
 * the `-1` not-found sentinel and the `0` first-element case.
 */
export const fixture = createFixture({
  id: 'array-indexOf',
  description: '.indexOf(x) returns the 0-based position',
  source: `
function ArrayIndexOf({ items, target }: { items: string[]; target: string }) {
  return <div>idx: {items.indexOf(target)}</div>
}
export { ArrayIndexOf }
`,
  props: { items: ['a', 'b', 'c'], target: 'b' },
  expectedHtml: `
    <div bf-s="test" bf="s1">idx: <!--bf:s0-->1<!--/--></div>
  `,
})
