import { createFixture } from '../src/types'

/**
 * A multi-operand `&&` chain guarding one JSX element
 * (`a() && b() && <el/>`). The condition side is a compound boolean,
 * not a single getter — pins that the conditional lowering takes the
 * WHOLE left-hand chain as the guard rather than only the first
 * operand.
 */
export const fixture = createFixture({
  id: 'logical-and-chain',
  description: 'Chained a() && b() && <element/> conditional',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function LogicalAndChain() {
  const [ready, setReady] = createSignal(true)
  const [visible, setVisible] = createSignal(false)
  return <div>{ready() && visible() && <span>both on</span>}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0--><!--bf-cond-end:s0--></div>
  `,
})
