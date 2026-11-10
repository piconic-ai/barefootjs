import { createFixture } from '../src/types'

/**
 * The `@client` escape of `signal-seed-uninlinable-local-function-named-like-prop`:
 * the signal is read on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'signal-seed-uninlinable-local-function-named-like-prop-client',
  description: 'The /* @client */ escape of a signal seeded from a local function a template cannot inline',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function SignalSeedUninlinableLocalFunctionNamedLikePropClient(props: { value?: number }) {
  function value() {
    const one = 1
    return one
  }
  const [n] = createSignal(value())
  return <p>{/* @client */ n()}</p>
}
`,
  props: { value: 9 },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
