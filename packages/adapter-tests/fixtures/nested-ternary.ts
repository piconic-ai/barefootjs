import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'nested-ternary',
  description: 'Nested ternary conditional rendering',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NestedTernaryDemo() {
  const [status, setStatus] = createSignal('idle')
  return <div>{status() === 'loading' ? <span>Loading...</span> : status() === 'error' ? <span>Error</span> : <span>Idle</span>}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2"><!--bf-cond-start:s0--><span bf-c="s1">Idle</span><!--bf-cond-end:s0--></div>
  `,
})
