import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `destructure-default-spread-memo-body`: the
 * memo is read on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-memo-body-client',
  description: 'The client-directive escape of a memo spreading a defaulted prop in its body',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultSpreadMemoBodyClient(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const n = createMemo(() => [...b, 'z'].length)
  return <p>{/* @client */ n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
