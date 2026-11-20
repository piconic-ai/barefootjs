import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `destructure-default-spread-const-length`:
 * the read of the array const is deferred to the browser, so the server
 * renders the text slot empty.
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-const-length-client',
  description: 'The client-directive escape of a read of an array const spreading a defaulted prop',
  source: `
'use client'
export function DestructureDefaultSpreadConstLengthClient(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const local = [...b, 'z']
  return <p>{/* @client */ local.length}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
