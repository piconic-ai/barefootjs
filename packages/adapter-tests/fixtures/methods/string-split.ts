import { createFixture } from '../../src/types'

/**
 * `String.prototype.split(sep)` lowering (#1448 Tier B).
 *
 * `split` is the first string method whose result is an *array* rather
 * than a scalar, so the fixture chains `.split(',').join('|')` to make
 * the slice observable in rendered output and to pin that the result
 * composes with the existing `.join` lowering on every adapter. The
 * `|` join separator differs from the `,` split separator so a lowering
 * that confused the two would still fail the assertion.
 */
export const fixture = createFixture({
  id: 'string-split',
  description: '.split(sep) splits a string into an array of substrings',
  source: `
function StringSplit({ value }: { value: string }) {
  return <div>{value.split(',').join('|')}</div>
}
export { StringSplit }
`,
  props: { value: 'a,b,c' },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a|b|c<!--/--></div>
  `,
})
