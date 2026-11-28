import { createFixture } from '../src/types'

/**
 * A memo whose body filters with a `typeof` predicate (#3981):
 * `props.items.filter(t => typeof t === 'string').length`. The callback runs
 * where the memo is computed, so the memo is refused (BF101) on every template
 * adapter, where it rendered empty, or `0` on Go; `/* @client *\/` defers the
 * read (`memo-typeof-filter-callback-client`).
 */
export const fixture = createFixture({
  id: 'memo-typeof-filter-callback',
  description: 'A memo filtering with a typeof predicate renders the count (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'memo-typeof-filter-callback-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoTypeofFilterCallback(props: { items: unknown[] }) {
  const count = createMemo(() => props.items.filter(t => typeof t === 'string').length)
  return <p>{count()}</p>
}
`,
  props: { items: ['a', 1, 'b'] },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
