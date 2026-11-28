import { createFixture } from '../src/types'

/**
 * A memo returning an object literal that reads a module const array element: `const A = [10, 20]`, `createMemo(() => ({ k: A[1] }))`.
 */
export const fixture = createFixture({
  id: 'memo-object-body-reads-module-const-array-element',
  description: 'A memo returning an object literal that reads a module const array element renders it',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const A = [10, 20]
export function MemoObjectBodyReadsModuleConstArrayElement() {
  const m = createMemo(() => ({ k: A[1] }))
  return <p>{m().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->20<!--/--></p>
  `,
})
