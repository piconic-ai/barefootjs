import { createFixture } from '../src/types'

/**
 * A block-bodied memo returning an object literal that reads a module const member: `createMemo(() => { return { k: o.k } })`.
 */
export const fixture = createFixture({
  id: 'memo-object-block-return-reads-module-const-member',
  description: 'A block-bodied memo returning an object literal that reads a module const member renders the member',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const o = { k: 1 }
export function MemoObjectBlockReturnReadsModuleConstMember() {
  const m = createMemo(() => { return { k: o.k } })
  return <p>{m().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
})
