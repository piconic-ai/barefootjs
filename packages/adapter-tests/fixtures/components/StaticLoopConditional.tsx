'use client'

// Test fixture (#2897): a static (non-signal) array's `.map()` row contains
// a reactive conditional alongside a static sibling. Both arms render an
// element (`<b>`/`<i>`), so this shape evades #1665's `bodyIsItemConditional`
// carve-out too (that gate only fires for a WHOLE-row conditional with at
// least one EMPTY branch) — before the fix, the static forEach bake had no
// conditional-handling machinery at all, so the branch froze at its initial
// (SSR-time) value and clicking "Toggle" did nothing.

import { createSignal } from '@barefootjs/client'

interface Item {
  id: number
  label: string
}

export function StaticLoopConditional() {
  const items: Item[] = [
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Beta' },
  ]
  const [flag, setFlag] = createSignal(true)

  const toggle = () => setFlag(v => !v)

  return (
    <div>
      <button type="button" class="toggle" onClick={toggle}>
        Toggle
      </button>
      <ul>
        {items.map(item => (
          <li key={item.id}>
            <span class="label">{item.label}</span>
            {flag() ? <b class="on">on</b> : <i class="off">off</i>}
          </li>
        ))}
      </ul>
    </div>
  )
}
