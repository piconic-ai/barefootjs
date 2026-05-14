import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'logical-and',
  description: 'Logical AND conditional rendering',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function LogicalAndDemo() {
  const [show, setShow] = createSignal(false)
  return <div>{show() && <span>Shown</span>}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0--><!--bf-cond-end:s0--></div>
  `,
})
