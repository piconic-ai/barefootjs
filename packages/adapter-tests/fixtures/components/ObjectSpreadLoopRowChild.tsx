'use client'

// Test fixture (#3861): a loop row spread onto a child component
// (`rows().map(r => <Chip key={r.id} tone="base" {...r} />)`). Every key of
// the row reaches the child, merged with the call's explicit props in
// source order, and a later value of the row reaches the child too.

import { createSignal } from '@barefootjs/client'

type Row = { id: string; label: string; size: number }

function Chip(props: { id: string; label: string; size?: number; tone?: string }) {
  const [on, setOn] = createSignal(false)
  return <button data-id={props.id} data-size={props.size} data-tone={props.tone} onClick={() => setOn(!on())}>{props.label}{on() ? '!' : ''}</button>
}

export function ObjectSpreadLoopRowChild(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal(props.rows)
  return (
    <div>
      <section>{rows().map(r => <Chip key={r.id} tone="base" {...r} />)}</section>
      <a onClick={() => setRows(rows().map(r => ({ ...r, label: r.label + '+' })))}>rename</a>
    </div>
  )
}
