import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `memo-block-local-chain-reads-typeof-const`: the
 * memo is read on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'memo-block-local-chain-reads-typeof-const-client',
  description: 'The client-directive escape of a block memo passing a typeof const member through locals',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const b = 'fallback'
export function MemoBlockLocalChainReadsTypeofConstClient(props: { x: string }) {
  const o = { kind: typeof props.x }
  const m = createMemo(() => {
    const a = o.kind
    const b = a
    return b
  })
  return <p>{/* @client */ m()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
