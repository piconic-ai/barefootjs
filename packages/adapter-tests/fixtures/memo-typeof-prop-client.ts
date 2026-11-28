import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `memo-typeof-prop`: the memo is read on the
 * client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'memo-typeof-prop-client',
  description: 'The client-directive escape of a memo applying typeof to a prop',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoTypeofPropClient(props: { x: string }) {
  const kind = createMemo(() => typeof props.x)
  return <p>{/* @client */ kind()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
