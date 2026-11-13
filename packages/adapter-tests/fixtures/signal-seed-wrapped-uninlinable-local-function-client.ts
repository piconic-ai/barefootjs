import { createFixture } from '../src/types'

/**
 * The `@client` escape of `signal-seed-wrapped-uninlinable-local-function`:
 * the signal is read on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'signal-seed-wrapped-uninlinable-local-function-client',
  description: 'The /* @client */ escape of a signal seeded through an inlinable wrapper of a local function a template cannot inline',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function SignalSeedWrappedUninlinableLocalFunctionClient() {
  function value() {
    const one = 1
    return one
  }
  function wrap() { return value() }
  const [n] = createSignal(wrap())
  return <p>{/* @client */ n()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
