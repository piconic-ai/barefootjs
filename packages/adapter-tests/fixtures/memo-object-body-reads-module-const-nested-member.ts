import { createFixture } from '../src/types'

/**
 * A memo returning an object literal that reads a nested module const member: `const o = { a: { b: "x" } }`, `createMemo(() => ({ k: o.a.b }))`.
 */
export const fixture = createFixture({
  id: 'memo-object-body-reads-module-const-nested-member',
  description: 'A memo returning an object literal that reads a nested module const member renders it',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const o = { a: { b: 'x' } }
export function MemoObjectBodyReadsModuleConstNestedMember() {
  const m = createMemo(() => ({ k: o.a.b }))
  return <p>{m().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->x<!--/--></p>
  `,
})
