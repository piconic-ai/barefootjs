import { createFixture } from '../src/types'

/**
 * A memo returning an object literal of literals: `createMemo(() => ({ k: 1 }))`,
 * `m().k`. A sibling of `memo-object-body-reads-module-const-member` (#4057):
 * Go seeded every object-literal memo `nil`.
 */
export const fixture = createFixture({
  id: 'memo-object-body-literal-member',
  description: 'A memo returning an object literal of literals renders the member',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoObjectBodyLiteralMember() {
  const m = createMemo(() => ({ k: 1 }))
  return <p>{m().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
})
