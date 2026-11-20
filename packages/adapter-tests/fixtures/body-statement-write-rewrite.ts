import { createFixture } from '../src/types'

/**
 * The rewrite the BF101 of `checkStatementWrites` names, for
 * `destructure-default-body-mutated-memo` and
 * `body-statement-write-direct-read`: the binding gets its final value where
 * it is declared (the default `['y', 'z']`) instead of a `push` in a statement
 * after it.
 * Every reader, on the server and on the client, then computes from one
 * value: the memo, the text and the attribute all read `2`.
 */
export const fixture = createFixture({
  id: 'body-statement-write-rewrite',
  description: 'A binding given its final value where it is declared, read by a memo and by the markup',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function BodyStatementWriteRewrite(props: { b?: string[] }) {
  const { b: local = ['y', 'z'] } = props
  const n = createMemo(() => local.length)
  return <p data-n={local.length}>{n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1" data-n="2"><!--bf:s0-->2<!--/--></p>
  `,
})
