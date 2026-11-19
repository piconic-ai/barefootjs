'use client'

// Test fixture (#3921): a `/* @client */` conditional whose arms are single
// elements, outside a loop and inside the row of a signal array. The server
// renders only the conditional's marker pair, so the client has to mount the
// matching arm at hydration (no server element exists to adopt) and swap it
// when the condition changes.

import { createSignal } from '@barefootjs/client'

export function ClientConditionalElementArms() {
  const [n, setN] = createSignal(0)
  const [rows] = createSignal([
    { id: 'a', kind: 'on' },
    { id: 'b', kind: 'off' },
  ])

  return (
    <div>
      <button type="button" class="inc" onClick={() => setN(n() + 1)}>
        inc
      </button>
      <p class="top">{/* @client */ n() > 0 ? <b>{'n=' + n()}</b> : <i>off</i>}</p>
      <ul class="rows">
        {rows().map(r => (
          <li key={r.id}>{/* @client */ r.kind === 'on' ? <b>{'n=' + n()}</b> : <i>off</i>}</li>
        ))}
      </ul>
    </div>
  )
}
