import { createFixture } from '../src/types'

/**
 * A component-scope const object whose initializer reads a signal
 * (`const live = { n: count() }`), passed bare as a child prop. The server
 * renders the value the const holds at render time (`2`). The static-literal
 * sibling (`const obj = { n: 1 }`) is `const-object-child-prop-identity`.
 */
export const fixture = createFixture({
  id: 'signal-const-object-child-prop',
  description: 'A const object that reads a signal, passed as a child prop, renders its value in the child',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Live = { n: number }
function Show(props: { live: Live }) {
  return <output>{props.live.n}</output>
}
export function Host() {
  const [count] = createSignal(2)
  const live = { n: count() }
  return <div><Show live={live} /></div>
}
`,
  componentName: 'Host',
  expectedHtml: `
    <div bf-s="test"><output bf-s="test_s0" bf="s1"><!--bf:s0-->2<!--/--></output></div>
  `,
})
