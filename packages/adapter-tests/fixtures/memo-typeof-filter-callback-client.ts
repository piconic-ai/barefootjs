import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `memo-typeof-filter-callback`: the memo is
 * read on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'memo-typeof-filter-callback-client',
  description: 'The client-directive escape of a memo filtering with a typeof predicate',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoTypeofFilterCallbackClient(props: { items: unknown[] }) {
  const count = createMemo(() => props.items.filter(t => typeof t === 'string').length)
  return <p>{/* @client */ count()}</p>
}
`,
  props: { items: ['a', 1, 'b'] },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
