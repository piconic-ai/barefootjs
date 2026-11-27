import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `memo-block-return-reads-typeof-const`: the read happens on the client only,
 * so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'memo-block-return-reads-typeof-const-client',
  description: 'The client-directive escape of memo-block-return-reads-typeof-const',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoBlockReturnReadsTypeofConstClient(props: { x: string }) {
  const o = { n: typeof props.x }
  const m = createMemo(() => {
    return { n: o.n }
  })
  return <p>{/* @client */ m().n}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
