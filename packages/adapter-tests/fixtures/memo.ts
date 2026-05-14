import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'memo',
  description: 'Derived value with createMemo',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function MemoDemo() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)
  return <div><span>{count()}</span><span>{doubled()}</span></div>
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->0<!--/--></span>
      <span bf="s3"><!--bf:s2-->0<!--/--></span>
    </div>
  `,
})
