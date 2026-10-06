'use client'

// Test fixture: `RowPortalRef.tsx` with a child component in each row, so
// the loop compiles to the composite (element-reconciliation) path.

import { createSignal, createPortal } from '@barefootjs/client'

function RowLabel(props: { text: string }) {
  return <span className="label">{props.text}</span>
}

export function RowPortalRefComposite(props: { rows: string[] }) {
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
        {props.rows.map(r => (
          <li key={r}>
            <RowLabel text={r} />
            <button type="button" className="row" ref={mountContent} onClick={() => setLast(r)}>
              {r}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
