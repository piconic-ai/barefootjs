'use client'

// Test fixture (#3845): a closed-type `...rest` spread onto a child
// component, before explicit props. The spread unrolls per key and the
// client reads each key as `_p.<key>`, so the hydration payload (`bf-p`)
// carries the rest keys too: `size` reaches the child only through the
// spread, and `tone` is in the payload even though the explicit
// `tone="override"` written after it wins in the rendered child.

import { createSignal } from '@barefootjs/client'

function Chip(props: { label: string; tone?: string; size?: number }) {
  const [on, setOn] = createSignal(false)
  return <button data-tone={props.tone} data-size={props.size} onClick={() => setOn(!on())}>{props.label}{on() ? '!' : ''}</button>
}

export function RestSpreadChildOverrideHydrationProps({ label, ...rest }: { label: string; tone?: string; size?: number }) {
  return <div><Chip {...rest} tone="override" label={label} /></div>
}
