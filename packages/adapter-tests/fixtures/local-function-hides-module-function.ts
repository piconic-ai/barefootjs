import { createFixture } from '../src/types'

/**
 * A component function hides a module function of the same name: a call in
 * the component reads the component's, as in JS, so the markup call and the
 * signal seeded from it render its `2`, not the module function's `1`.
 */
export const fixture = createFixture({
  id: 'local-function-hides-module-function',
  description: 'A component function hides the module function of its name in markup and in a signal seed',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
function value() { return 1 }
export function LocalFunctionHidesModuleFunction(props: { value?: number }) {
  function value() { return 2 }
  const [n] = createSignal(value())
  return <p>{value()}:{n()}</p>
}
`,
  props: { value: 9 },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->2<!--/-->:<!--bf:s1-->2<!--/--></p>
  `,
})
