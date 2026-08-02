import { createFixture } from '../src/types'

/**
 * `<dialog open={sig()}>` — same boolean `open` contract as
 * `details-open`, on the element where a wrongly-stringified value is
 * most user-visible (a `open="false"` dialog renders on screen).
 * The false-initial case, so this pins the OMIT side of the contract.
 */
export const fixture = createFixture({
  id: 'dialog-open',
  description: 'Signal-driven dialog omits open entirely for a false initial value',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function Confirm() {
  const [open, setOpen] = createSignal(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Show</button>
      <dialog open={open()}><p>Sure?</p></dialog>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <button bf="s0">Show</button>
      <dialog bf="s1"><p>Sure?</p></dialog>
    </div>
  `,
})
