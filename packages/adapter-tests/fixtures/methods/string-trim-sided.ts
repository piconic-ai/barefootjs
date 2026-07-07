import { createFixture } from '../../src/types'

/**
 * `trimStart()` / `trimEnd()` — the one-sided siblings of the #1448
 * `string-trim` fixture. Bracketed output makes a both-sides trim (or
 * a wrong-side trim) fail visibly.
 */
export const fixture = createFixture({
  id: 'string-trim-sided',
  description: '.trimStart() and .trimEnd() strip only their own side',
  source: `
function StringTrimSided({ value }: { value: string }) {
  return (
    <div>
      <span>[{value.trimStart()}]</span>
      <span>[{value.trimEnd()}]</span>
    </div>
  )
}
export { StringTrimSided }
`,
  props: { value: '  mid  ' },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1">[<!--bf:s0-->mid <!--/-->]</span>
      <span bf="s3">[<!--bf:s2--> mid<!--/-->]</span>
    </div>
  `,
})
