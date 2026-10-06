'use client'

// Test fixture: keyed `.map()` rows whose `<button>` a `ref` callback
// portals to `document.body` (see `RowPortalRef.tsx`). Clicking a row's
// button removes that row: the portaled button must leave with its row, and
// the remaining row's button must still reach its own handler.

import { createSignal, createPortal } from '@barefootjs/client'

export function RowPortalRefRemove(props: { rows: string[] }) {
  const [rows, setRows] = createSignal(props.rows)
  const mountContent = (el: HTMLElement) => {
    if (el.parentNode !== document.body) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }
  return (
    <div>
      <p className="count">{rows().length}</p>
      <ul>
        {rows().map(r => (
          <li key={r}>
            <button type="button" className="row" ref={mountContent} onClick={() => setRows(rs => rs.filter(x => x !== r))}>
              {r}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
