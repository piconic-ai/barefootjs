import { createFixture } from '../src/types'

/**
 * A memo reading a memo that applies `typeof` (#3981): the server render reads
 * the inner memo through the outer one. The inner memo is refused (BF101) on
 * every template adapter, where it rendered `null!` or empty; `/* @client *\/`
 * on the outer read defers both (`memo-typeof-through-memo-client`).
 */
export const fixture = createFixture({
  id: 'memo-typeof-through-memo',
  description: 'A memo reading a memo that applies typeof renders the type name (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'memo-typeof-through-memo-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoTypeofThroughMemo(props: { x: string }) {
  const kind = createMemo(() => typeof props.x)
  const label = createMemo(() => kind() + '!')
  return <p>{label()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string!<!--/--></p>
  `,
})
