import { createFixture } from '../../src/types'

/**
 * `String.prototype.endsWith(suffix)` lowering (#1448 Tier B).
 *
 * Sibling of `string-startsWith` — boolean at condition position. The
 * suffix matches the end of the value so the truthy branch renders; a
 * lowering that confused prefix/suffix (or HasPrefix vs HasSuffix)
 * would render the `no` branch and fail the assertion.
 */
export const fixture = createFixture({
  id: 'string-endsWith',
  description: '.endsWith(suffix) renders the matching branch',
  source: `
function StringEndsWith({ value, suffix }: { value: string; suffix: string }) {
  return <div>{value.endsWith(suffix) ? 'yes' : 'no'}</div>
}
export { StringEndsWith }
`,
  props: { value: 'hello world', suffix: 'world' },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0-->yes<!--bf-cond-end:s0--></div>
  `,
})
