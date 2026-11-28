import { createFixture } from '../src/types'

/**
 * A memo returning an object literal that reads a module const member (#4057):
 * `const o = { k: 1 }`, `createMemo(() => ({ k: o.k }))`, `m().k`. Go seeded
 * the memo `nil` (the analyzer carries no `parsed` tree for an object-literal
 * body) and the read failed the render with a nil pointer; Hono renders `1`.
 */
export const fixture = createFixture({
  id: 'memo-object-body-reads-module-const-member',
  description: 'A memo returning an object literal that reads a module const member renders the member',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const o = { k: 1 }
export function MemoObjectBodyReadsModuleConstMember() {
  const m = createMemo(() => ({ k: o.k }))
  return <p>{m().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
})
