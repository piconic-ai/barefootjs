import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `destructure-default-spread-const-memo`: the
 * memo is read on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-const-memo-client',
  description: 'The client-directive escape of a memo over a const spreading a defaulted prop',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultSpreadConstMemoClient(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const local = [...b, 'z']
  const n = createMemo(() => local.length)
  return <p>{/* @client */ n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
