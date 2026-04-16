import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'client-only-loop-with-sibling-cond',
  description: '@client loop with conditional sibling: SSR emits loop boundary markers (#872)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client-runtime'
export function ChatList() {
  const [items, setItems] = createSignal<string[]>([])
  const [streaming, setStreaming] = createSignal(false)
  return (
    <div id="container">
      {/* @client */ items().map(item => (
        <div key={item} className="item">{item}</div>
      ))}
      {/* @client */ streaming() && (
        <div className="streaming">streaming...</div>
      )}
      <button onClick={() => setItems(prev => [...prev, 'new item'])}>Add</button>
    </div>
  )
}
`,
  // <!--bf-loop--><!--bf-/loop--> are stripped by normalizeHTML in jsx-runner,
  // so expectedHtml shows the normalized form with the markers absent.
  // The conditional markers (<!--bf-cond-start:s1--><!--bf-cond-end:s1-->) remain
  // and must appear AFTER the loop markers in the raw output.
  expectedHtml: `
    <div id="container" bf-s="test" bf="s3"><!--bf-cond-start:s1--><!--bf-cond-end:s1--><button bf="s2">Add</button></div>
  `,
})
