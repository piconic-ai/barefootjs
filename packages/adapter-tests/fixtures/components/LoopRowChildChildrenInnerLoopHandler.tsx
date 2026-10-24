'use client'

// Test fixture: an event handler on an element of an inner loop inside a
// loop-row child component's forwarded children. The handler reads the
// inner item and the outer row item. The row containers are `<div>`s: a
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
  const [picked, setPicked] = createSignal('none')
  return (
    <div>
      <p className="picked">{picked()}</p>
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
    </div>
  )
}
