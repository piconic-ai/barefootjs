import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `signal-seed-typeof-prop`: the signal is read
 * on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'signal-seed-typeof-prop-client',
  description: 'The client-directive escape of a signal seeded from typeof of a prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalSeedTypeofPropClient(props: { x: string }) {
  const [kind] = createSignal(typeof props.x)
  return <p>{/* @client */ kind()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
