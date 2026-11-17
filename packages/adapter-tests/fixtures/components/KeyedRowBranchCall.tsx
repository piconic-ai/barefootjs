'use client'

// Test fixture: a keyed `.map()` row whose conditional branch is one bare
// expression that calls a function (#3894). The button replaces every row
// with a new item under the same key, so each row is reused; a branch must
// then show the new value, as the same call directly in the row does.
//
// Row 1 starts at `wait: 0`, so the first click also moves it from the
// `'0s'` arm to the arm with the call, and the second click moves row 3 of
// the nested list into its `'long'` arm.

import { createMemo, createSignal } from '@barefootjs/client'

type Row = { id: number; wait: number }

const fmt = (ms: number) => `${ms / 1000}s`

function fmtDecl(ms: number) {
  return `${ms / 1000}s`
}

export function KeyedRowBranchCall() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 1, wait: 0 },
    { id: 2, wait: 500 },
    { id: 3, wait: 2000 },
  ])
  const [scale, setScale] = createSignal<number>(1)
  const shown = createMemo(() => rows())
  return (
    <div>
      <button type="button" className="slower" onClick={() => setRows(rows().map(r => ({ ...r, wait: r.wait * 3 + 250 })))}>
        slower
      </button>
      <button type="button" className="scale" onClick={() => setScale(scale() * 2)}>
        scale
      </button>
      <ol className="plain">
        {rows().map(row => (
          <li key={row.id}>{fmt(row.wait)}</li>
        ))}
      </ol>
      <ol className="tern-call">
        {rows().map(row => (
          <li key={row.id}>{row.wait === 0 ? '0s' : fmt(row.wait)}</li>
        ))}
      </ol>
      <ol className="tern-nocall">
        {rows().map(row => (
          <li key={row.id}>{row.wait === 0 ? '0s' : `+${row.wait}`}</li>
        ))}
      </ol>
      <ol className="tern-template">
        {rows().map(row => (
          <li key={row.id}>{row.wait === 0 ? '0s' : `+${fmt(row.wait)}`}</li>
        ))}
      </ol>
      <ol className="tern-declaration">
        {rows().map(row => (
          <li key={row.id}>{row.wait === 0 ? '0s' : fmtDecl(row.wait)}</li>
        ))}
      </ol>
      <ol className="logical-and">
        {rows().map(row => (
          <li key={row.id}>{row.wait > 0 && fmt(row.wait)}</li>
        ))}
      </ol>
      <ol className="nested">
        {rows().map(row => (
          <li key={row.id}>{row.wait === 0 ? '0s' : row.wait > 9000 ? 'long' : fmt(row.wait)}</li>
        ))}
      </ol>
      <ol className="memo-destructured">
        {shown().map(({ id, wait }, i) => (
          <li key={id}>{wait === 0 ? '0s' : fmt(wait + i)}</li>
        ))}
      </ol>
      <ol className="signal-in-call">
        {rows().map(row => (
          <li key={row.id}>{row.wait === 0 ? '0s' : fmt(row.wait * scale())}</li>
        ))}
      </ol>
    </div>
  )
}
