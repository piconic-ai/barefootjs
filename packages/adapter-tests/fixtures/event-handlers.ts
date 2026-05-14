import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'event-handlers',
  description: 'Multiple event handler types (onClick, onInput)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function EventHandlers() {
  const [text, setText] = createSignal('')
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <input type="text" onInput={(e) => setText(e.currentTarget.value)} />
      <button onClick={() => setCount(n => n + 1)}>Click</button>
      <span>{text()}</span>
      <span>{count()}</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <input type="text" bf="s0">
      <button bf="s1">Click</button>
      <span bf="s3"><!--bf:s2--><!--/--></span>
      <span bf="s5"><!--bf:s4-->0<!--/--></span>
    </div>
  `,
})
