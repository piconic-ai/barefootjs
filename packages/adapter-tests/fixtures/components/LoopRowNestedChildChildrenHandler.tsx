'use client'

// Test fixture: an event handler on an element forwarded through a child
// component that is NOT the loop row's root — nested inside the row's root
// component (`.nested`, over a module const), or inside a plain-element row
// of a signal array (`.composite`; `add` prepends a row built on the
// client). The forwarded element renders inside that child's scope, below
// the row element, and the click is never handled.

import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

type Row = { id: string; label: string }

const NESTED: Row[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
]

export function LoopRowNestedChildChildrenHandler() {
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
      <div className="nested">
        {NESTED.map((o) => (
          <Chip key={o.id}>
            <Chip>
              <button type="button" className="pick" onClick={() => setPicked(`n-${o.id}`)}>{o.label}</button>
            </Chip>
          </Chip>
        ))}
      </div>
      <div className="composite">
        {rows().map((o) => (
          <div key={o.id} className="row">
            <Chip>
              <button type="button" className="pick" onClick={() => setPicked(`c-${o.id}`)}>{o.label}</button>
            </Chip>
          </div>
        ))}
      </div>
    </div>
  )
}
