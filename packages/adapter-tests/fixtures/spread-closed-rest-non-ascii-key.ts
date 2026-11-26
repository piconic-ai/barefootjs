import { createFixture } from '../src/types'

/**
 * A closed rest key outside ASCII (`Ä`) and a later attribute that differs
 * from it only in that letter's case (`ä`). The HTML tokenizer lowercases
 * only the ASCII letters `A`-`Z`, so the two are distinct attributes: the
 * later one does not replace the rest's key, and both render.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-non-ascii-key',
  description: 'A closed rest key Ä and a later attribute ä render as two attributes',
  source: `
import { NonAscii } from './non-ascii'
export function SpreadClosedRestNonAsciiKey() {
  return <div><NonAscii Ä={2} /></div>
}
`,
  components: {
    './non-ascii.tsx': `
export function NonAscii({ ...rest }: { Ä?: number }) {
  return <p {...rest} ä="1">d</p>
}
`,
  },
  expectedHtml: `
    <div bf-s="test"><p bf-s="test_s0" Ä="2" ä="1">d</p></div>
  `,
})
