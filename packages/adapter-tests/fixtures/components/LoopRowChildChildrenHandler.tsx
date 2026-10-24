'use client'

// Test fixture (#3607): an event handler on an element forwarded as a
// loop-row child component's JSX children. The handler reads the row item
// (`.item`), the row item and the row index (`.index`), and destructured
// row bindings with the index (`.destructured`), over a signal array; and
// the row item and index over a module-const array (`.static`). The client
// JS once wired no handler at all for this position, so every click was
// dropped. The server-rendered rows are hydrated, and `add` prepends a row
// built on the client, shifting the index of the others.

import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

type Row = { id: string; label: string }

const STATIC_ROWS: Row[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
]

export function LoopRowChildChildrenHandler() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ])
  const [picked, setPicked] = createSignal('none')
  return (
    <div>
      <p className="picked">{picked()}</p>
      <button type="button" className="add" onClick={() => setRows([{ id: 'c', label: 'C' }, ...rows()])}>
        add
      </button>
      <div className="item">
        {rows().map((o) => (
          <Chip key={o.id}>
            <button type="button" className="pick" onClick={() => setPicked(o.id)}>{o.label}</button>
          </Chip>
        ))}
      </div>
      <div className="index">
        {rows().map((o, i) => (
          <Chip key={o.id}>
            <button type="button" className="pick" onClick={() => setPicked(`${o.id}@${i}`)}>{o.label}</button>
          </Chip>
        ))}
      </div>
      <div className="destructured">
        {rows().map(({ id, label }, i) => (
          <Chip key={id}>
            <button type="button" className="pick" onClick={() => setPicked(`${id}#${i}`)}>{label}</button>
          </Chip>
        ))}
      </div>
      <div className="static">
        {STATIC_ROWS.map((o, i) => (
          <Chip key={o.id}>
            <button type="button" className="pick" onClick={() => setPicked(`s-${o.id}@${i}`)}>{o.label}</button>
          </Chip>
        ))}
      </div>
    </div>
  )
}
