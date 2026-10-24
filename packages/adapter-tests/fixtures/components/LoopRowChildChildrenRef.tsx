'use client'

// Test fixture (#3612): a `ref` callback on an element forwarded as a
// loop-row child component's JSX children. The callback registers a click
// listener on the element it receives, which reports the row item
// (`.item`), the row item and the row index (`.index`), and destructured row
// bindings with the index from an element nested one level below the
// forwarded root (`.destructured`), over a signal array; and the row item
// and index over a module-const array (`.static`). The client JS once
// invoked no callback at all for this position on a signal-array loop, so
// no listener was registered and every click was dropped. The
// server-rendered rows are hydrated, and `add` prepends a row built on the
// client, shifting the index of the others.

import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

type Row = { id: string; label: string }

const STATIC_ROWS: Row[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
]

export function LoopRowChildChildrenRef() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ])
  const [picked, setPicked] = createSignal('none')
  const register = (el: HTMLElement, value: () => string) => {
    el.addEventListener('click', () => setPicked(value()))
  }
  return (
    <div>
      <p className="picked">{picked()}</p>
      <button type="button" className="add" onClick={() => setRows([{ id: 'c', label: 'C' }, ...rows()])}>
        add
      </button>
      <div className="item">
        {rows().map((o) => (
          <Chip key={o.id}>
            <button type="button" className="pick" ref={(el: HTMLElement) => register(el, () => o.id)}>pick</button>
          </Chip>
        ))}
      </div>
      <div className="index">
        {rows().map((o, i) => (
          <Chip key={o.id}>
            <button type="button" className="pick" ref={(el: HTMLElement) => register(el, () => `${o.id}@${i}`)}>pick</button>
          </Chip>
        ))}
      </div>
      <div className="destructured">
        {rows().map(({ id, label }, i) => (
          <Chip key={id}>
            <label>
              {label}
              <button type="button" className="pick" ref={(el: HTMLElement) => register(el, () => `${id}#${i}`)}>pick</button>
            </label>
          </Chip>
        ))}
      </div>
      <div className="static">
        {STATIC_ROWS.map((o, i) => (
          <Chip key={o.id}>
            <button type="button" className="pick" ref={(el: HTMLElement) => register(el, () => `s-${o.id}@${i}`)}>pick</button>
          </Chip>
        ))}
      </div>
    </div>
  )
}
