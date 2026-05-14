import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'nullish-coalescing-text',
  description: 'Nullish coalescing (??) in text content renders correctly',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NullishCoalescingText(props: { label?: string; size?: number }) {
  const [count, setCount] = createSignal(props.size ?? 1)
  return <div><span>{props.label ?? 'Default'}</span><span>{count()}</span></div>
}
`,
  props: { label: 'Custom', size: 5 },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->Custom<!--/--></span>
      <span bf="s3"><!--bf:s2-->5<!--/--></span>
    </div>
  `,
})
