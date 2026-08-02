'use client'

// Scratch verification component (#2463 coordinator follow-up): proves
// `insertRoot()`'s SWAP path (not just its hydrate path) correctly
// re-initializes a CHILD COMPONENT mounted inside one branch of a
// component-level `if`/`else` early return, mirroring the real shape
// `Slot`/`Button` compose (a branch that calls a child via `renderChild`)
// but with a genuinely reactive (signal-backed) condition rather than a
// destructured prop — so the swap actually fires, unlike `asChild`.
import { createSignal } from '@barefootjs/client'
import { Badge } from './Badge'

export function IfStatementChildSwap() {
  const [showBadge, setShowBadge] = createSignal(true)
  if (showBadge()) {
    return (
      <div>
        <Badge label="on" />
        <button onClick={() => setShowBadge(false)}>toggle</button>
      </div>
    )
  }
  return (
    <div>
      <span>off</span>
      <button onClick={() => setShowBadge(true)}>toggle</button>
    </div>
  )
}
