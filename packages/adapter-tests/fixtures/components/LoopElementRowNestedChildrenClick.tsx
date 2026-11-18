'use client'

// Test fixture (#3734): a click on a button forwarded through two nested
// components inside a plain-element loop row. The row is a `<section>`
// (not a component), so the inner component's children reach the row only
// through the outer component's slot, and the handler has to find the row
// item from two scopes below the row. `.fixed` loops a signal array that is never
// set, `.signal` loops one that `add` prepends to, so that list also
// has a row built on the client.

import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <em className="chip">{children}</em>
}

type Row = { id: string; label: string }

export function LoopElementRowNestedChildrenClick() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ])
  const [fixedRows] = createSignal<Row[]>([
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
      <div className="fixed">
        {fixedRows().map((o) => (
          <section key={o.id}>
            <Chip>
              <Chip>
                <button type="button" className="pick" onClick={() => setPicked(`fx-${o.id}`)}>{o.label}</button>
              </Chip>
            </Chip>
          </section>
        ))}
      </div>
      <div className="signal">
        {rows().map((o) => (
          <section key={o.id}>
            <Chip>
              <Chip>
                <button type="button" className="pick" onClick={() => setPicked(`sg-${o.id}`)}>{o.label}</button>
              </Chip>
            </Chip>
          </section>
        ))}
      </div>
    </div>
  )
}
