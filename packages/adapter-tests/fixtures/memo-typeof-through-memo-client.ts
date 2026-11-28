import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `memo-typeof-through-memo`: the outer memo is
 * read on the client only, so the server reads neither memo.
 */
export const fixture = createFixture({
  id: 'memo-typeof-through-memo-client',
  description: 'The client-directive escape of a memo reading a memo that applies typeof',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoTypeofThroughMemoClient(props: { x: string }) {
  const kind = createMemo(() => typeof props.x)
  const label = createMemo(() => kind() + '!')
  return <p>{/* @client */ label()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
