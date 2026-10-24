import { createFixture } from '../src/types'

/**
 * `.at(i)` on half of a surrogate pair (#3613). JS returns a lone
 * surrogate, which is still a real value before serialization: the two
 * halves of `'😀'` compare different, and concatenating them back
 * rebuilds the emoji. A runtime whose strings can't hold a lone surrogate
 * (UTF-8 hosts) substitutes U+FFFD, so both halves compare equal and the
 * concatenation renders `��`.
 *
 * The value comes from a signal seeded with a literal so the generated
 * data points (which vary props) never hit it.
 */
export const fixture = createFixture({
  id: 'string-at-lone-surrogate',
  description: '`.at(i)` on half of a surrogate pair keeps the lone surrogate: halves compare different and rejoin into the emoji',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function StringAtLoneSurrogate() {
  const [word, setWord] = createSignal('a😀b')
  return (
    <div data-pair={\`\${word().at(1)}\${word().at(2)}\`}>
      <p>{\`\${word().at(1)}\${word().at(2)}\`}</p>
      <p>{word().at(1) === word().at(2) ? 'same' : 'different'}</p>
      <button onClick={() => setWord('x')}>reset</button>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s5" data-pair="😀">
      <p bf="s1"><!--bf:s0-->😀<!--/--></p>
      <p bf="s3"><!--bf-cond-start:s2-->different<!--bf-cond-end:s2--></p>
      <button bf="s4">reset</button>
    </div>
  `,
})
