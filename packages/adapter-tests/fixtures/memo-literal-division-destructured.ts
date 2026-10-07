import { createFixture } from '../src/types'

/**
 * The destructured-prop twin of `memo-literal-division` (#3379): a memo
 * dividing a destructured number prop by an integer literal yields the
 * JavaScript quotient.
 */
export const fixture = createFixture({
  id: 'memo-literal-division-destructured',
  description: 'A memo dividing a destructured number prop by an integer literal renders the JavaScript quotient',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoLiteralDivisionDestructured({ value }: { value: number }) {
  const eighth = createMemo(() => value / 8)
  return <p data-eighth={eighth()}>{eighth()}</p>
}
`,
  props: { value: 1234567890 },
  expectedHtml: `
    <p bf-s="test" bf="s1" data-eighth="154320986.25"><!--bf:s0-->154320986.25<!--/--></p>
  `,
})
