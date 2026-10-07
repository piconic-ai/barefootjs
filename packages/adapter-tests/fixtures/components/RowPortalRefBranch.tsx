'use client'

// Test fixture: `RowPortalRef.tsx` with the loop inside a conditional
// branch, so the loop compiles to the branch-scoped path.

import { createSignal, createPortal } from '@barefootjs/client'

export function RowPortalRefBranch(props: { rows: string[] }) {
  const [open, setOpen] = createSignal(true)
  const [last, setLast] = createSignal('none')
  const mountContent = (el: HTMLElement) => {
    if (el.parentNode !== document.body) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }
  return (
    <div>
      <button type="button" className="toggle" onClick={() => setOpen(o => !o)}>toggle</button>
      <p className="last">{last()}</p>
      {open() ? (
        <ul>
          {props.rows.map(r => (
            <li key={r}>
              <button type="button" className="row" ref={mountContent} onClick={() => setLast(r)}>
                {r}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
