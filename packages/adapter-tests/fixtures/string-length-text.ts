import { createFixture } from '../src/types'

/**
 * `.length` of a STRING prop (the array `.length` lowering is pinned
 * elsewhere; string length is a distinct accessor in most template
 * backends — Go `len`, Ruby `.length`, Perl `length()`, PHP `strlen`).
 */
export const fixture = createFixture({
  id: 'string-length-text',
  description: 'String .length in text content',
  source: `
function StringLengthText({ word }: { word: string }) {
  return <div>{word.length} chars in {word}</div>
}
export { StringLengthText }
`,
  props: { word: 'barefoot' },
  // JS `.length` counts UTF-16 code units: '日本語' is 3 (a byte-based
  // `len` would say 9), '👍' is 2 (a surrogate pair — codepoint-based
  // counts would say 1). The oracle pins the JS answer.
  dataPoints: [
    { name: 'empty', props: { word: '' } },
    { name: 'multibyte', props: { word: '日本語' } },
    { name: 'astral', props: { word: '👍' } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s2"><!--bf:s0-->8<!--/--> chars in <!--bf:s1-->barefoot<!--/--></div>
  `,
})
