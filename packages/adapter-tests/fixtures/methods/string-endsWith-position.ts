import { createFixture } from '../../src/types'

/**
 * `String.prototype.endsWith(search, endPosition)` — the endPosition
 * form (#1448 Tier B, full-arity). The optional second argument treats
 * the string as if it were only that many characters long
 * (`"hello world".endsWith("hello", 5) === true`). Boolean-returning,
 * so it sits at condition position like `string-endsWith`.
 */
export const fixture = createFixture({
  id: 'string-endsWith-position',
  description: '.endsWith(search, endPosition) re-anchors the suffix test',
  source: `
function StringEndsWithPosition({ value }: { value: string }) {
  return <div>{value.endsWith('hello', 5) ? 'yes' : 'no'}</div>
}
export { StringEndsWithPosition }
`,
  props: { value: 'hello world' },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0-->yes<!--bf-cond-end:s0--></div>
  `,
})
