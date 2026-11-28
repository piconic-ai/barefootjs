import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `memo-typeof-block-return`: the memo is read on
 * the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'memo-typeof-block-return-client',
  description: 'The client-directive escape of a block memo returning typeof of a prop',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoTypeofBlockReturnClient(props: { x: string }) {
  const kind = createMemo(() => {
    return typeof props.x
  })
  return <p>{/* @client */ kind()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
