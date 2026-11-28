import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `memo-exponent-operator`: both memos are read
 * on the client only, so the server leaves their slots empty.
 */
export const fixture = createFixture({
  id: 'memo-exponent-operator-client',
  description: 'The client-directive escape of a memo applying ** and ~ to a prop',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoExponentOperatorClient(props: { n: number }) {
  const square = createMemo(() => props.n ** 2)
  const flipped = createMemo(() => ~props.n)
  return <p>{/* @client */ square()} {/* @client */ flipped()}</p>
}
`,
  props: { n: 3 },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0--><!--/--><!--bf:s1--><!--/--></p>
  `,
})
