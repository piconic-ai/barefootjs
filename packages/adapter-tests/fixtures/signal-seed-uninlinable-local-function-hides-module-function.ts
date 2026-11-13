import { createFixture } from '../src/types'

/**
 * A component function a template cannot inline (its body is more than one
 * `return`) hides a module function of the same name: the call reads the
 * component's, as in JS, so the markup call and the signal seeded from it
 * render its `2`. A template cannot compute that, and refuses (BF101) rather
 * than read the module function's `1`.
 */
export const fixture = createFixture({
  id: 'signal-seed-uninlinable-local-function-hides-module-function',
  description: 'A component function a template cannot inline hides the module function of its name, and refuses',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
function value() { return 1 }
export function SignalSeedUninlinableLocalFunctionHidesModuleFunction(props: { value?: number }) {
  function value() {
    const two = 2
    return two
  }
  const [n] = createSignal(value())
  return <p>{value()}:{n()}</p>
}
`,
  props: { value: 9 },
  escapes: [{ kind: 'client-directive', fixture: 'signal-seed-uninlinable-local-function-hides-module-function-client' }],
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->2<!--/-->:<!--bf:s1-->2<!--/--></p>
  `,
})
