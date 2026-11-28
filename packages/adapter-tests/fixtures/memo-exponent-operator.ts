import { createFixture } from '../src/types'

/**
 * A memo whose body applies `**` and `~` to a prop (#3981). A template lowers
 * comparison and arithmetic but neither of these, so it
 * rendered empty, or `0` on Go, where Hono renders the computed value; every
 * template adapter refuses it (BF101), and `/* @client *\/` defers the read
 * (`memo-exponent-operator-client`).
 */
export const fixture = createFixture({
  id: 'memo-exponent-operator',
  description: 'A memo applying ** and ~ to a prop renders the computed numbers (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'memo-exponent-operator-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoExponentOperator(props: { n: number }) {
  const square = createMemo(() => props.n ** 2)
  const flipped = createMemo(() => ~props.n)
  return <p>{square()} {flipped()}</p>
}
`,
  props: { n: 3 },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->9<!--/--><!--bf:s1-->-4<!--/--></p>
  `,
})
