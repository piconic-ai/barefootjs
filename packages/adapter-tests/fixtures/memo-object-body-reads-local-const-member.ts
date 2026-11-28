import { createFixture } from '../src/types'

/**
 * A memo returning an object literal that reads a component const member: `const o = { k: 1 }` in the component, `createMemo(() => ({ k: o.k }))`.
 */
export const fixture = createFixture({
  id: 'memo-object-body-reads-local-const-member',
  description: 'A memo returning an object literal that reads a component const member renders the member',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoObjectBodyReadsLocalConstMember() {
  const o = { k: 1 }
  const m = createMemo(() => ({ k: o.k }))
  return <p>{m().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
})
