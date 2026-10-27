'use client'

// Test fixture (#3694): an event handler on an element of an inner loop
// inside a loop-row child component's forwarded children. The handler reads
// the inner item and the outer row item, over a module-const array
// (`.rows`, hydrated rows only), and with both indexes over a signal array
// (`.live`), where `add` prepends a row built on the client and shifts the
// outer index of the others. The client JS once attached no handler in this
// position, so every click was dropped. The row containers are `<div>`s: a
// `<ul>` inside a `<p>` closes the `<p>` when the browser parses the SSR
// markup.

import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

type Row = { id: string; tags: string[] }

const ROWS: Row[] = [
  { id: 'a', tags: ['x', 'y'] },
  { id: 'b', tags: ['z'] },
]

export function LoopRowChildChildrenInnerLoopHandler() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 'a', tags: ['x', 'y'] },
    { id: 'b', tags: ['z'] },
  ])
  const [picked, setPicked] = createSignal('none')
  return (
    <div>
      <p className="picked">{picked()}</p>
      <button type="button" className="add" onClick={() => setRows([{ id: 'c', tags: ['p', 'q'] }, ...rows()])}>
        add
      </button>
      <div className="rows">
        {ROWS.map((o) => (
          <Chip key={o.id}>
            <ul>
              {o.tags.map((tag) => (
                <li key={tag}>
                  <button type="button" className="pick" onClick={() => setPicked(`${o.id}-${tag}`)}>{tag}</button>
                </li>
              ))}
            </ul>
          </Chip>
        ))}
      </div>
      <div className="live">
        {rows().map((o, i) => (
          <Chip key={o.id}>
            <ul>
              {o.tags.map((tag, j) => (
                <li key={tag}>
                  <button type="button" className="pick" onClick={() => setPicked(`${o.id}-${tag}@${i}.${j}`)}>{tag}</button>
                </li>
              ))}
            </ul>
          </Chip>
        ))}
      </div>
    </div>
  )
}
