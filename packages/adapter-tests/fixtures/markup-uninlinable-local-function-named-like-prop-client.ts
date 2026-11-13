import { createFixture } from '../src/types'

/**
 * The `@client` escape of `markup-uninlinable-local-function-named-like-prop`:
 * the call renders on the client, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'markup-uninlinable-local-function-named-like-prop-client',
  description: 'The /* @client */ escape of a local function call a template cannot inline',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function MarkupUninlinableLocalFunctionNamedLikePropClient(props: { value?: number }) {
  function value() {
    const one = 1
    return one
  }
  const [n] = createSignal(0)
  return <p>{/* @client */ value()}|{n()}</p>
}
`,
  props: { value: 9 },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0--><!--/-->|<!--bf:s1-->0<!--/--></p>
  `,
})
