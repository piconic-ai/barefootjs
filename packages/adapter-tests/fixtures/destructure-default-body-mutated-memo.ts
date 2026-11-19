import { createFixture } from '../src/types'

/**
 * A body destructure default mutated after its declaration
 * (`local.push('z')`) and read through a memo declared after the statement
 * (`createMemo(() => local.length)`). In JS the memo sees the pushed element
 * (`2`). No compiled output does: a template renders a binding from its
 * declaration and runs no body statement, and the client's init creates the
 * memo before it runs the statement. So the shape is refused (BF101,
 * `checkStatementWrites`) in the shared compile, ahead of any adapter, and
 * pinned on every adapter including the reference: the limitation
 * `body-statement-write-read-as-declared`. `expectedHtml` is the JS value, the
 * contract a lowering that runs the body in source order must meet.
 *
 * The way out is the rewrite twin `body-statement-write-rewrite`, which gives
 * the binding its final value where it is declared. `/* @client *\/` is not
 * one: the memo itself is computed too early, wherever it is read.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-mutated-memo',
  description: 'A body destructure binding mutated after its declaration, read through a memo, renders the mutated value',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultBodyMutatedMemo(props: { b?: string[] }) {
  const { b: local = ['y', ''].filter((x) => x !== '') } = props
  local.push('z')
  const n = createMemo(() => local.length)
  return <p>{n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'body-statement-write-rewrite' }],
})
