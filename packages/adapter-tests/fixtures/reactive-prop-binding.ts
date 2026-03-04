import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'reactive-prop-binding',
  description: 'Child receives multiple reactive props from different signals',
  source: `
'use client'
import { createSignal } from '@barefootjs/dom'
import { Status } from './status'
export function Dashboard() {
  const [label, setLabel] = createSignal('idle')
  const [count, setCount] = createSignal(0)
  return <div><Status label={label()} count={count()} /><button onClick={() => setCount(n => n + 1)}>+</button></div>
}
`,
  components: {
    './status.tsx': `
export function Status({ label, count }: { label: string; count: number }) {
  return <span>{label}: {count}</span>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <span bf-s="test_s0" bf="s2"><!--bf:s0-->idle<!--/-->: <!--bf:s1-->0<!--/--></span>
      <button bf="s1">+</button>
    </div>
  `,
})
