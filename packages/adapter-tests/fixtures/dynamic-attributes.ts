import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'dynamic-attributes',
  description: 'Dynamic data attributes bound to signals',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function DynamicAttributes() {
  const [state, setState] = createSignal('closed')
  const [count, setCount] = createSignal(0)
  return <div data-state={state()} data-count={count()}>Content</div>
}
`,
  expectedHtml: `
    <div data-state="closed" data-count="0" bf-s="test" bf="s0">Content</div>
  `,
})
