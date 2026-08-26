'use client'

// DOM-state carrier fixture (#2481): native <details open={...}>, toggled
// by a click handler that flips the backing signal (rather than relying
// on the browser's own native toggle, so the compiler's boolean-attribute
// reactivity is what's under test). Exercises the `open` IDL property the
// oracle harness's dom-state.ts vocabulary tracks — the shared-component
// corpus had no native <details> fixture before this (only the static,
// non-hydrating `details-open` conformance fixture).

import { createSignal } from '@barefootjs/client'

export function DetailsFaq() {
  const [open, setOpen] = createSignal(false)

  return (
    <details className="faq-details" open={open()}>
      <summary
        className="faq-summary"
        onClick={(e) => {
          e.preventDefault()
          setOpen(!open())
        }}
      >
        What is BarefootJS?
      </summary>
      <p className="faq-body">A JSX-to-marked-template compiler with signal-based reactivity.</p>
    </details>
  )
}
