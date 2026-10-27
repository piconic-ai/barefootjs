import { createFixture } from '../src/types'

/**
 * A (props)-arg component's local function shares its name with a typed
 * prop the body never destructures: the signal seed calls the function, so
 * a supplied colliding prop (`{ value: 9 }`) still renders the function's `1`.
 */
export const fixture = createFixture({
  id: 'signal-seed-local-function-named-like-prop',
  description: 'A signal seed calling a local function named like a typed prop calls the function, not the prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalSeedLocalFunctionNamedLikeProp(props: { value?: number }) {
  function value() { return 1 }
  const [n] = createSignal(value())
  return <p>{n()}</p>
}
`,
  props: { value: 9 },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
  dataPoints: [
    { name: 'value-absent', props: {} },
  ],
})
