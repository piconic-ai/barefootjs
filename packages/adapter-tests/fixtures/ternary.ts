import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'ternary',
  description: 'Ternary conditional rendering',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function TernaryDemo() {
  const [show, setShow] = createSignal(false)
  return <div>{show() ? <span>Visible</span> : <span>Hidden</span>}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><span bf-c="s0">Hidden</span></div>
  `,
})
