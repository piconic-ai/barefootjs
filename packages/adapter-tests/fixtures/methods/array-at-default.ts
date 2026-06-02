import { createFixture } from '../../src/types'

/**
 * `Array.prototype.at()` with no argument (#1448 full-arity).
 *
 * JS `.at()` is `.at(0)` (`ToIntegerOrInfinity(undefined) === 0`), i.e.
 * the first element. Pins that the adapters default the index to 0
 * rather than refusing the zero-arg form, and that the result matches
 * real JS across Hono / Go / Mojo (the conformance harness renders this
 * through all three).
 */
export const fixture = createFixture({
  id: 'array-at-default',
  description: '.at() with no argument returns the first element',
  source: `
function ArrayAtDefault({ items }: { items: string[] }) {
  return <div>[{items.at()}]</div>
}
export { ArrayAtDefault }
`,
  props: { items: ['x', 'y', 'z'] },
  expectedHtml: `
    <div bf-s="test" bf="s1">[<!--bf:s0-->x<!--/-->]</div>
  `,
})
