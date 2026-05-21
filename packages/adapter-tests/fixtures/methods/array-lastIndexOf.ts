import { createFixture } from '../../src/types'

/**
 * `Array.prototype.lastIndexOf(x)` lowering (#1448 Tier A).
 *
 * Pinning a duplicated value with the LAST occurrence at a non-final
 * index disambiguates `lastIndexOf` from `indexOf` — if a lowering
 * walks forward instead of backward, the wrong index surfaces in the
 * rendered output.
 */
export const fixture = createFixture({
  id: 'array-lastIndexOf',
  description: '.lastIndexOf(x) returns the position of the last match',
  source: `
function ArrayLastIndexOf({ items, target }: { items: string[]; target: string }) {
  return <div>last: {items.lastIndexOf(target)}</div>
}
export { ArrayLastIndexOf }
`,
  props: { items: ['a', 'b', 'c', 'b', 'd'], target: 'b' },
  expectedHtml: `
    <div bf-s="test" bf="s1">last: <!--bf:s0-->3<!--/--></div>
  `,
})
