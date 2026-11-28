import { createFixture } from '../src/types'

/**
 * A memo returning an object literal that reads a member of a module const array of objects: `const A = [{ k: "a" }, { k: "b" }]`, `createMemo(() => ({ k: A[1].k }))`.
 */
export const fixture = createFixture({
  id: 'memo-object-body-reads-module-const-object-row',
  description: 'A memo returning an object literal that reads a member of a module const object row renders it',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const A = [{ k: 'a' }, { k: 'b' }]
export function MemoObjectBodyReadsModuleConstObjectRow() {
  const m = createMemo(() => ({ k: A[1].k }))
  return <p>{m().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->b<!--/--></p>
  `,
})
