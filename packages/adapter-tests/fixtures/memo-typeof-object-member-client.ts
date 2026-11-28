import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `memo-typeof-object-member`: the memo is read on
 * the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'memo-typeof-object-member-client',
  description: 'The client-directive escape of a memo returning an object with a typeof member',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoTypeofObjectMemberClient(props: { x: string }) {
  const info = createMemo(() => ({ kind: typeof props.x }))
  return <p>{/* @client */ info().kind}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
