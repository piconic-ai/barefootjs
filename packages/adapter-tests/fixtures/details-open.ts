import { createFixture } from '../src/types'

/**
 * `<details open={sig()}>` — `open` is the state-carrying boolean
 * attribute of `<details>` (and `<dialog>`, see `dialog-open`). The
 * true case must SSR bare `open`; a stringified `open="false"` would
 * render the details expanded. HTML element/attribute semantics
 * checklist member.
 */
export const fixture = createFixture({
  id: 'details-open',
  description: 'Signal-driven details SSRs boolean open from the initial value',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function Faq() {
  const [open, setOpen] = createSignal(true)
  return (
    <details open={open()}>
      <summary onClick={(e) => { e.preventDefault(); setOpen(!open()) }}>What is it?</summary>
      <p>A compiler.</p>
    </details>
  )
}
`,
  expectedHtml: `
    <details bf-s="test" bf="s1" open>
      <summary bf="s0">What is it?</summary>
      <p>A compiler.</p>
    </details>
  `,
})
