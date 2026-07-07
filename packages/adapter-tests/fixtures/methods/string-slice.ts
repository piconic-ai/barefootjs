import { createFixture } from '../../src/types'

/**
 * `String.prototype.slice(start, end)` — the STRING sibling of the
 * #1448 `array-slice` fixture. String slicing is a different runtime
 * surface in most backends (Go substring vs `bf_slice` on slices,
 * Ruby `[a...b]`, PHP `substr`), so array coverage doesn't imply it.
 * Includes the negative-start form (`slice(-4)`), which naive
 * substring lowerings get wrong.
 */
export const fixture = createFixture({
  id: 'string-slice',
  description: '.slice(start, end) and .slice(-n) on a string prop',
  source: `
function StringSlice({ word }: { word: string }) {
  return (
    <div>
      <span>{word.slice(0, 4)}</span>
      <span>{word.slice(-4)}</span>
    </div>
  )
}
export { StringSlice }
`,
  props: { word: 'barefootjs' },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->bare<!--/--></span>
      <span bf="s3"><!--bf:s2-->otjs<!--/--></span>
    </div>
  `,
})
