'use client'

// Test fixture (#3921): a `/* @client */` conditional inside a static
// (module-const) array's `.map()` row. The server does not render the
// conditional, so after hydration the client has to mount the matching arm in
// every row and keep it live. `inline` writes the condition in the row,
// `helper` calls an arrow helper over the row, and `signal` reads a signal in
// the condition.

import { createSignal } from '@barefootjs/client'

interface Row {
  id: string
  kind: string
}

const rows: Row[] = [
  { id: 'a', kind: 'on' },
  { id: 'b', kind: 'off' },
]

const isOn = (r: Row) => r.kind === 'on'

export function StaticLoopRowClientConditional() {
  const [n, setN] = createSignal(0)

  return (
    <div>
      <button type="button" class="inc" onClick={() => setN(n() + 1)}>
        inc
      </button>
      <ul class="inline">
        {rows.map(r => (
          <li key={r.id}>{/* @client */ r.kind === 'on' ? <b>{'n=' + n()}</b> : <i>off</i>}</li>
        ))}
      </ul>
      <ul class="helper">
        {rows.map(r => (
          <li key={r.id}>{/* @client */ isOn(r) ? <b>{'n=' + n()}</b> : <i>off</i>}</li>
        ))}
      </ul>
      <ul class="signal">
        {rows.map(r => (
          <li key={r.id}>{/* @client */ n() > 0 && r.kind === 'on' ? <b>on</b> : <i>off</i>}</li>
        ))}
      </ul>
    </div>
  )
}
