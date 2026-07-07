import { createFixture } from '../src/types'

/**
 * ONE signal bound to an attribute and a text slot on the SAME
 * element. The two bindings need independent lowering (attribute
 * interpolation vs text slot markers) fed by one dependency — a
 * binding table keyed only by signal name collapses them.
 */
export const fixture = createFixture({
  id: 'signal-attr-and-text',
  description: 'Same signal feeding an attribute and a text slot on one element',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalAttrAndText() {
  const [status, setStatus] = createSignal('idle')
  return <output data-status={status()}>{status()}</output>
}
`,
  expectedHtml: `
    <output bf-s="test" bf="s1" data-status="idle"><!--bf:s0-->idle<!--/--></output>
  `,
})
