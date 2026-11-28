import { createFixture } from '../src/types'

/**
 * A memo mapping module const rows to object literals that read a module const
 * member, rendered by a loop over the memo:
 * `createMemo(() => ROWS.map(r => ({ id: r, k: o.k })))`.
 */
export const fixture = createFixture({
  id: 'memo-object-rows-read-module-const-member',
  description: 'A memo of object rows reading a module const member renders it in each loop row',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const o = { k: 'v' }
const ROWS = ['a', 'b']
export function MemoObjectRowsReadModuleConstMember() {
  const rows = createMemo(() => ROWS.map(r => ({ id: r, k: o.k })))
  return <ul>{rows().map(r => <li key={r.id}>{r.id}{r.k}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="a"><!--bf:s0-->a<!--/--><!--bf:s1-->v<!--/--></li>
      <li data-key="b"><!--bf:s0-->b<!--/--><!--bf:s1-->v<!--/--></li>
    </ul>
  `,
})
