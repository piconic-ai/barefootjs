import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `destructure-default-spread-method-text`: the
 * call runs on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-method-text-client',
  description: 'The client-directive escape of markup calling a literal const method that spreads a defaulted prop',
  source: `
'use client'
export function DestructureDefaultSpreadMethodTextClient(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const api = { add: () => [...b, 'z'].length }
  return <p>{/* @client */ api.add()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
