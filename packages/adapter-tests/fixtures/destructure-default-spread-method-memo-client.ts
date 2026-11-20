import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `destructure-default-spread-method-memo`: the
 * memo is read on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-method-memo-client',
  description: 'The client-directive escape of a memo calling a literal const method that spreads a defaulted prop',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultSpreadMethodMemoClient(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const api = { add: () => [...b, 'z'].length }
  const n = createMemo(() => api.add())
  return <p>{/* @client */ n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
