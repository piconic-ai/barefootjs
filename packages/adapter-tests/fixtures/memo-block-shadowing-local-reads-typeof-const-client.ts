import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `memo-block-shadowing-local-reads-typeof-const`:
 * the memo is read on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'memo-block-shadowing-local-reads-typeof-const-client',
  description: 'The client-directive escape of a block memo whose shadowing local reads a typeof const member',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const label = 'fallback'
export function MemoBlockShadowingLocalReadsTypeofConstClient(props: { x: string }) {
  const o = { kind: typeof props.x }
  const m = createMemo(() => {
    const label = o.kind
    const unused = () => false
    return label
  })
  return <p>{/* @client */ m()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
