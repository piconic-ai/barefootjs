import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'counter',
  description: 'Counter with signal and event handler',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(n => n + 1)}>Count: {count()}</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s1">Count: <!--bf:s0-->0<!--/--></button>
  `,
})
