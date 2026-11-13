import { createFixture } from '../src/types'

/**
 * The `@client` escape of `signal-seed-uninlinable-local-function-hides-module-function`:
 * both reads are deferred to the client, so the server leaves their slots empty.
 */
export const fixture = createFixture({
  id: 'signal-seed-uninlinable-local-function-hides-module-function-client',
  description: 'The /* @client */ escape of a component function a template cannot inline that hides a module function',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
function value() { return 1 }
export function SignalSeedUninlinableLocalFunctionHidesModuleFunctionClient(props: { value?: number }) {
  function value() {
    const two = 2
    return two
  }
  const [n] = createSignal(value())
  return <p>{/* @client */ value()}:{/* @client */ n()}</p>
}
`,
  props: { value: 9 },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0--><!--/-->:<!--bf:s1--><!--/--></p>
  `,
})
