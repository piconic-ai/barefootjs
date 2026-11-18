'use client'

// Test fixture (#3731): a child component inside an inner loop of a
// loop-row child component's forwarded children. The inner component takes
// a handler prop that reads the inner and the outer item. The client JS
// once never initialised that component, so its handler was never attached
// and every click was dropped. Same layout as the #3694 fixture: a
// module-const array (`.rows`, hydrated rows only) and a signal array
// (`.live`), where `add` prepends a row built on the client and shifts the
// outer index of the others. The row containers are `<div>`s: a `<ul>`
// inside a `<p>` closes the `<p>` when the browser parses the SSR markup.

import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Btn({ label, onPick }: { label: string; onPick: () => void }) {
  return <button type="button" class="pick" onClick={onPick}>{label}</button>
}

type Row = { id: string; tags: string[] }

const ROWS: Row[] = [
  { id: 'a', tags: ['x', 'y'] },
  { id: 'b', tags: ['z'] },
]

export function LoopRowChildChildrenInnerLoopComponent() {
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
                  <Btn label={tag} onPick={() => setPicked(`${o.id}-${tag}`)} />
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
                  <Btn label={tag} onPick={() => setPicked(`${o.id}-${tag}@${i}.${j}`)} />
                </li>
              ))}
            </ul>
          </Chip>
        ))}
      </div>
    </div>
  )
}
