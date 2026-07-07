import { createFixture } from '../src/types'

/**
 * Two independent `&&` conditionals as ADJACENT siblings, one truthy
 * and one falsy at SSR. Pins that each conditional gets its own
 * marker pair and that the falsy first branch doesn't swallow or
 * shift its truthy sibling.
 */
export const fixture = createFixture({
  id: 'adjacent-conditionals',
  description: 'Two sibling && conditionals with independent signals',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function AdjacentConditionals() {
  const [showA, setShowA] = createSignal(false)
  const [showB, setShowB] = createSignal(true)
  return (
    <div>
      {showA() && <span>A</span>}
      {showB() && <span>B</span>}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2"><!--bf-cond-start:s0--><!--bf-cond-end:s0--><span bf-c="s1">B</span></div>
  `,
})
