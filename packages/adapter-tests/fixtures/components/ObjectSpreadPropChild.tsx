'use client'

// Test fixture (#3861): an object prop spread onto a child component in a
// single call (`<Chip label="ignored" tone="base" {...row} id="fixed" />`).
// The row's `label` and `size` override the props written before the
// spread, `tone` keeps its explicit value because the row has no such key,
// and the `id` written after the spread wins over the row's.

import { createSignal } from '@barefootjs/client'

type Row = { id: string; label: string; size: number }

function Chip(props: { id: string; label: string; size?: number; tone?: string }) {
  const [on, setOn] = createSignal(false)
  return <button data-id={props.id} data-size={props.size} data-tone={props.tone} onClick={() => setOn(!on())}>{props.label}{on() ? '!' : ''}</button>
}

export function ObjectSpreadPropChild({ row }: { row: Row }) {
  return <div><Chip label="ignored" tone="base" {...row} id="fixed" /></div>
}
