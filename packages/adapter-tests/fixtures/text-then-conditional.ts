import { createFixture } from '../src/types'

/**
 * Static text immediately followed by a signal-driven ternary, with no
 * whitespace between them in the JSX (`x:{on() ? 'on' : 'off'}`). The text
 * and the chosen branch abut in the output (`x:off`); a template that adds
 * whitespace around the conditional block puts a visible space there.
 * `-static` is the same shape driven by a prop in a server-only component;
 * `conditional-then-text` is the mirror (text right after the conditional).
 */
export const fixture = createFixture({
  id: 'text-then-conditional',
  description: 'Text directly followed by a signal-driven ternary renders with no whitespace between them',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function TextThenConditional() {
  const [on] = createSignal(false)
  return <p>x:{on() ? 'on' : 'off'}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1">x:<!--bf-cond-start:s0-->off<!--bf-cond-end:s0--></p>
  `,
})
