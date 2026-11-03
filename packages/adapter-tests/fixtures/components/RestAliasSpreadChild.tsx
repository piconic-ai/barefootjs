'use client'

// Test fixture (#3861): a local alias of a closed-type `...rest`
// (`const forwarded = rest`) spread onto a child component. The alias
// holds the rest object, so its spread unrolls per key like `{...rest}`:
// `size` reaches the child only through the spread, and `label`, which the
// rest leaves out, is not forwarded to the second child.

import { createSignal } from '@barefootjs/client'

function Chip(props: { label?: string; tone?: string; size?: number }) {
  const [on, setOn] = createSignal(false)
  return <button data-tone={props.tone} data-size={props.size} onClick={() => setOn(!on())}>{props.label ?? 'none'}{on() ? '!' : ''}</button>
}

export function RestAliasSpreadChild({ label, ...rest }: { label: string; tone?: string; size?: number }) {
  const forwarded = rest
  return <div><Chip {...forwarded} tone="override" label={label} /><Chip {...forwarded} /></div>
}
