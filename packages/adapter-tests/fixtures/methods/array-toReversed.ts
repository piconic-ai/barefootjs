import { createFixture } from '../../src/types'

/**
 * `Array.prototype.toReversed()` lowering (#1448 Tier A).
 *
 * The non-mutating sibling of `.reverse()`. Sharing a lowering with
 * `.reverse()` is fine in SSR template context (where the receiver
 * is never observed), but the fixture is split so adapters can pin
 * the surface explicitly and so a future per-method divergence
 * doesn't require renaming the existing pin.
 */
export const fixture = createFixture({
  id: 'array-toReversed',
  description: '.toReversed() emits the array in reverse order',
  source: `
function ArrayToReversed({ items }: { items: string[] }) {
  return <div>{items.toReversed().join(' ')}</div>
}
export { ArrayToReversed }
`,
  props: { items: ['a', 'b', 'c'] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->c b a<!--/--></div>
  `,
})
