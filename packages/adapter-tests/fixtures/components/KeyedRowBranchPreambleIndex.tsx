'use client'

// Test fixture: a keyed `.map()` row whose callback-preamble local is
// computed from the row's INDEX and feeds both branches of a conditional
// (#3913). The button reverses the rows (each key gets a new index) and flips
// every condition in the same update, so each row is reused and its branch
// swaps. The swapped-in branch has to show the row's new index.

import { createSignal } from '@barefootjs/client'

type Row = { id: string; name: string; on: boolean }

export function KeyedRowBranchPreambleIndex() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ])
  return (
    <div>
      <button type="button" className="reverse" onClick={() => setRows(rows().map(r => ({ ...r, on: !r.on })).reverse())}>
        reverse
      </button>
      <ul>
        {rows().map((row, i) => {
          const label = row.name + '@' + i
          return <li key={row.id}>{row.on ? <b>{label}</b> : <i>{label}</i>}</li>
        })}
      </ul>
    </div>
  )
}
