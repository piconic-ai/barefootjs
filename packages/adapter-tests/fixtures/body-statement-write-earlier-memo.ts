import { createFixture } from '../src/types'

/**
 * A memo declared BEFORE the body statement that writes the binding it reads
 * (`createMemo(() => local.length)`, then `local.push('z')`). In JS the memo
 * is computed where it is declared, from the array as declared (`1`), and
 * nothing recomputes it. The server render computes it from the declaration
 * as well, and the client's init creates the memo before it runs the
 * statement, so every side agrees: `checkStatementWrites` refuses a read
 * evaluated after the write, which this one is not.
 *
 * The CSR template leaves the slot empty (a memo over a binding a statement
 * changes is not inlined there) and the mount's effect fills it with `1`:
 * `CSR_SKIP_FIXTURES`, with the mount checked in `packages/client`'s
 * `issue-3719-body-statement-write.test.ts`.
 */
export const fixture = createFixture({
  id: 'body-statement-write-earlier-memo',
  description: 'A memo declared before a body statement writes the binding it reads keeps the declared value',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function BodyStatementWriteEarlierMemo(props: { b?: string[] }) {
  const { b: local = ['y'] } = props
  const n = createMemo(() => local.length)
  local.push('z')
  return <p>{n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
})
