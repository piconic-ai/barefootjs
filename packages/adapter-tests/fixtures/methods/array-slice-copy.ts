import { createFixture } from '../../src/types'

/**
 * `Array.prototype.slice()` with no arguments (#1448 full-arity).
 *
 * JS `.slice()` returns a full (shallow) copy. Pins that the adapters
 * default `start` to 0 rather than refusing the zero-arg form. Chained
 * into `.join('|')` so the copied array is observable.
 */
export const fixture = createFixture({
  id: 'array-slice-copy',
  description: '.slice() with no argument copies the whole array',
  source: `
function ArraySliceCopy({ items }: { items: string[] }) {
  return <div>{items.slice().join('|')}</div>
}
export { ArraySliceCopy }
`,
  props: { items: ['a', 'b', 'c'] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a|b|c<!--/--></div>
  `,
})
