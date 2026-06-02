import { createFixture } from '../../src/types'

/**
 * `Array.prototype.join()` with no separator (#1448 full-arity).
 *
 * JS defaults the separator to `,` when omitted. Pins that the adapters
 * supply the default rather than refusing the zero-arg form.
 */
export const fixture = createFixture({
  id: 'array-join-default',
  description: '.join() with no argument joins with the default comma',
  source: `
function ArrayJoinDefault({ items }: { items: string[] }) {
  return <div>{items.join()}</div>
}
export { ArrayJoinDefault }
`,
  props: { items: ['a', 'b', 'c'] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a,b,c<!--/--></div>
  `,
})
