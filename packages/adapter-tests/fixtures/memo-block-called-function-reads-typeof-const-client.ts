import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `memo-block-called-function-reads-typeof-const`:
 * the memo is read on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'memo-block-called-function-reads-typeof-const-client',
  description: 'The client-directive escape of a block memo calling a function over a typeof const member',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoBlockCalledFunctionReadsTypeofConstClient(props: { x: string }) {
  const o = { n: 2, kind: typeof props.x }
  const m = createMemo(() => {
    const f = () => o.kind
    return f()
  })
  return <p>{/* @client */ m()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
