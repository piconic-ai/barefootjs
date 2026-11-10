'use client'

// Test fixture: a `.map()` row that is itself a conditional (no wrapper
// element around the ternary). The row's branch is bound from a detached
// stand-in for the row's comment range, so the reactive attributes inside
// the branch (`hidden`, `data-x`, `class`) must be found among that range's
// nodes and keep following the signal after a CSR mount and after
// hydration.

import { createSignal } from '@barefootjs/client'

export function LoopItemCondAttrs() {
  const [shown] = createSignal(true)
  const [busy, setBusy] = createSignal(false)
  const [items] = createSignal([{ id: 1 }, { id: 2 }])
  return (
    <div>
      <button className="toggle" onClick={() => setBusy(!busy())}>{busy() ? 'busy' : 'idle'}</button>
      {items().map(item =>
        shown() ? (
          <em key={item.id} className={busy() ? 'row on' : 'row off'} data-x={busy() ? 'yes' : 'no'} hidden={busy()}>
            {item.id}
          </em>
        ) : null,
      )}
    </div>
  )
}
