'use client'

// Test fixture: sibling of `RowPortalRef` (#3420) whose portaled row element
// reads everything a loop row can see: the row item's fields, the loop
// index, a root-level prop, and a second loop whose first row is the falsy
// `0`. Every adapter renders each element at the portal outlet with those
// values, and the row adopts it at hydration.

import { createSignal, createPortal } from '@barefootjs/client'

type Row = { id: string; label: string }

export function RowPortalRefScope(props: { rows: Row[]; nums: number[]; prefix: string }) {
  const [last, setLast] = createSignal('none')
  const mountContent = (el: HTMLElement) => {
    if (el.parentNode !== document.body) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }
  return (
    <div>
      <p className="last">{last()}</p>
      <ul>
        {props.rows.map((r, i) => (
          <li key={r.id}>
            <button type="button" className="row" data-index={i} title={props.prefix} ref={mountContent} onClick={() => setLast(r.label)}>
              {i}:{r.label}
            </button>
          </li>
        ))}
      </ul>
      <ol>
        {props.nums.map(n => (
          <li key={n}>
            <button type="button" className="num" ref={mountContent} onClick={() => setLast(String(n))}>
              {n}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
