'use client'

// Test fixture (#2897): a static (non-signal) OUTER array whose row contains
// a nested (depth-1) `.map()` over plain elements, and the INNER loop's row
// has a reactive conditional. #2798 wired the inner loop's own ref/reactive-
// text/reactive-attr bindings into the static clone-and-wire architecture
// (`inner-loop-nested`), but that architecture has no conditional-handling
// machinery at all — before the fix, this conditional froze at its initial
// (SSR-time) value and clicking "Toggle" did nothing.

import { createSignal } from '@barefootjs/client'

interface Child {
  id: number
}

interface Row {
  id: number
  children: Child[]
}

export function StaticNestedLoopConditional() {
  const rows: Row[] = [
    { id: 1, children: [{ id: 11 }, { id: 12 }] },
  ]
  const [flag, setFlag] = createSignal(true)

  const toggle = () => setFlag(v => !v)

  return (
    <div>
      <button type="button" class="toggle" onClick={toggle}>
        Toggle
      </button>
      <ul>
        {rows.map(row => (
          <li key={row.id}>
            {row.children.map(child => (
              <span key={child.id} class="child">
                {flag() ? <b class="on">on</b> : <i class="off">off</i>}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
