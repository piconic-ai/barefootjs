'use client'

// Test fixture (#3845): a component that only spreads its whole props
// object onto a child names none of its props, but the client forwards
// every key of `_p` to the child. The hydration payload (`bf-p`) must carry
// the caller's whole bag, or the child hydrates with no label and no tone.

import { createSignal } from '@barefootjs/client'

function Chip(props: { label: string; tone?: string }) {
  const [on, setOn] = createSignal(false)
  return <button data-tone={props.tone} onClick={() => setOn(!on())}>{props.label}{on() ? '!' : ''}</button>
}

export function PropsObjectSpreadChildHydrationProps(props: { label: string; tone?: string }) {
  return <div><Chip {...props} /></div>
}
