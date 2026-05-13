import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'fragment',
  description: 'Fragment as root element',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FragmentDemo() {
  const [count, setCount] = createSignal(0)
  return <><span>A</span><span>{count()}</span></>
}
`,
  expectedHtml: `
    <span>A</span>
    <span bf="s1"><!--bf:s0-->0<!--/--></span>
  `,
})
