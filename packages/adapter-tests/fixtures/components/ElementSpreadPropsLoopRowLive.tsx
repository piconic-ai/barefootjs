'use client'

// Test fixture (#3917): the component's props object spread onto an element
// of a signal-array loop row. The rows the server rendered carry the caller's
// keys; a row the client builds (a client-only mount, or the row the button
// adds) must carry them too.

import { createSignal } from '@barefootjs/client'

export function ElementSpreadPropsLoopRowLive(props: { title?: string; id?: string }) {
  const [rows, setRows] = createSignal([{ k: 'a' }, { k: 'b' }])
  return (
    <div>
      <button class="add" onClick={() => setRows([...rows(), { k: 'c' }])}>add</button>
      <ul>{rows().map(r => <span key={r.k} {...props}>{r.k}</span>)}</ul>
    </div>
  )
}
