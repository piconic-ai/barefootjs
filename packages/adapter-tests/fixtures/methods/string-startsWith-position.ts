import { createFixture } from '../../src/types'

/**
 * `String.prototype.startsWith(search, position)` — the position form
 * (#1448 Tier B, full-arity). The optional second argument re-anchors
 * the test (`"hello world".startsWith("world", 6) === true`). Boolean-
 * returning, so it sits at condition position like `string-startsWith`.
 */
export const fixture = createFixture({
  id: 'string-startsWith-position',
  description: '.startsWith(search, position) re-anchors the prefix test',
  source: `
function StringStartsWithPosition({ value }: { value: string }) {
  return <div>{value.startsWith('world', 6) ? 'yes' : 'no'}</div>
}
export { StringStartsWithPosition }
`,
  props: { value: 'hello world' },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0-->yes<!--bf-cond-end:s0--></div>
  `,
})
