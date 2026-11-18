'use client'

// Test fixture: a keyed `.map()` row whose callback-preamble local is
// computed from an OUTER signal and feeds both branches of a conditional
// (#3913). The button changes the signal and flips every condition in the
// same update, so each row is reused and its branch swaps. The swapped-in
// branch has to show the signal's new value.

import { createSignal } from '@barefootjs/client'

type Row = { id: string; name: string; on: boolean }

export function KeyedRowBranchPreambleSignal() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ])
  const [suffix, setSuffix] = createSignal<string>('')
  return (
    <div>
      <button
        type="button"
        className="change"
        onClick={() => {
          setSuffix(`${suffix()}!`)
          setRows(rows().map(r => ({ ...r, on: !r.on })))
        }}
      >
        change
      </button>
      <ul>
        {rows().map(row => {
          const label = row.name + suffix()
          return <li key={row.id}>{row.on ? <b>{label}</b> : <i>{label}</i>}</li>
        })}
      </ul>
    </div>
  )
}
