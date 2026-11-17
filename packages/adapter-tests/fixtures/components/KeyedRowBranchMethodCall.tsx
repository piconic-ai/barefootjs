'use client'

// Test fixture: a keyed `.map()` row whose conditional branch calls a
// method or a global function on the row's value (#3894), in text position
// and in an attribute. Unlike a module helper, every adapter lowers these
// calls, so the server HTML is compared on all of them. The button replaces
// every row with a new item under the same key.

import { createSignal } from '@barefootjs/client'

type Row = { id: number; label: string; done: boolean }

export function KeyedRowBranchMethodCall() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 1, label: 'ada', done: true },
    { id: 2, label: 'bob', done: false },
    { id: 3, label: 'cy', done: true },
  ])
  return (
    <div>
      <button type="button" className="rename" onClick={() => setRows(rows().map(r => ({ ...r, label: `${r.label}-x` })))}>
        rename
      </button>
      <ul className="method">
        {rows().map(row => (
          <li key={row.id}>{row.done ? row.label.toUpperCase() : 'pending'}</li>
        ))}
      </ul>
      <ul className="global">
        {rows().map(row => (
          <li key={row.id}>{row.done ? String(row.label) : 'pending'}</li>
        ))}
      </ul>
      <ul className="element">
        {rows().map(row => (
          <li key={row.id}>{row.done ? <b title={row.label.toUpperCase()}>{row.label.toUpperCase()}</b> : null}</li>
        ))}
      </ul>
    </div>
  )
}
