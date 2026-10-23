'use client'

// Test fixture (#3595): an inner `.map()` inside a loop-row child
// component's forwarded children rebinds a name the OUTER row binds — the
// outer index (`(tag, i)` inside `(o, i)`), the outer item (`(o)` inside
// `(o)`), and an outer destructured binding (`(id, i)` inside
// `({ id, tags }, i)`). Inside the inner callback the name means the inner
// binding. The client JS once rewrote the inner PARAMETER as the outer
// row's accessor (`o().tags.map((tag, i()) => …)`), a SyntaxError that
// stopped the whole module from loading. The server-rendered rows are
// hydrated, and `add` prepends a row built on the client through that code,
// shifting the outer index of the others. The row containers are `<div>`s:
// a `<ul>` inside a `<p>` closes the `<p>` when the browser parses the SSR
// markup.

import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

type Row = { id: string; tags: string[] }

export function LoopRowChildChildrenInnerLoopShadow() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 'a', tags: ['x', 'y'] },
    { id: 'b', tags: ['z'] },
  ])
  return (
    <div>
      <button type="button" className="add" onClick={() => setRows([{ id: 'c', tags: ['p', 'q'] }, ...rows()])}>
        add
      </button>
      <div className="index">
        {rows().map((o, i) => (
          <Chip key={o.id}>
            <ul>{o.tags.map((tag, i) => <li key={tag}>{tag}-{i}</li>)}</ul>
          </Chip>
        ))}
      </div>
      <div className="item">
        {rows().map((o) => (
          <Chip key={o.id}>
            <ul>{o.tags.map((o) => <li key={o}>{o}</li>)}</ul>
          </Chip>
        ))}
      </div>
      <div className="destructured">
        {rows().map(({ id, tags }, i) => (
          <Chip key={id}>
            <ul>{tags.map((id, i) => <li key={id}>{id}-{i}</li>)}</ul>
          </Chip>
        ))}
      </div>
    </div>
  )
}
