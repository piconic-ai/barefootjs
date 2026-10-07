'use client'

// Test fixture: `RowPortalRef.tsx` over a module-level constant array, so
// the loop compiles to the static-array path instead of `mapArray`.

import { createSignal, createPortal } from '@barefootjs/client'

const ROWS = ['a', 'b']

export function RowPortalRefStatic() {
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
        {ROWS.map(r => (
          <li key={r}>
            <button type="button" className="row" ref={mountContent} onClick={() => setLast(r)}>
              {r}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
