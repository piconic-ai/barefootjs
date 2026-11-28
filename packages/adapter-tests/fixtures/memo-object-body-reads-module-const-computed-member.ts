import { createFixture } from '../src/types'

/**
 * A memo returning an object literal that reads a module const member by a string-literal computed key: `createMemo(() => ({ k: o["k"] }))`.
 */
export const fixture = createFixture({
  id: 'memo-object-body-reads-module-const-computed-member',
  description: 'A memo returning an object literal that reads a module const member by a computed key renders it',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const o = { k: 'v' }
export function MemoObjectBodyReadsModuleConstComputedMember() {
  const m = createMemo(() => ({ k: o['k'] }))
  return <p>{m().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->v<!--/--></p>
  `,
})
