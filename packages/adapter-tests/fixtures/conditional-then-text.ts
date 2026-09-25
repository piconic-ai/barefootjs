import { createFixture } from '../src/types'

/**
 * Mirror of `text-then-conditional`: a signal-driven ternary immediately
 * followed by static text (`{on() ? 'on' : 'off'}:y`). The chosen branch
 * and the text abut in the output (`off:y`).
 */
export const fixture = createFixture({
  id: 'conditional-then-text',
  description: 'A signal-driven ternary directly followed by text renders with no whitespace between them',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ConditionalThenText() {
  const [on] = createSignal(false)
  return <p>{on() ? 'on' : 'off'}:y</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf-cond-start:s0-->off<!--bf-cond-end:s0-->:y</p>
  `,
})
