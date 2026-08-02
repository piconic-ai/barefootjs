'use client'

// Minimal child component for `IfStatementChildSwap` (#2463 coordinator
// follow-up scratch verification) — has its own click-counting state so a
// real-browser test can prove the child actually (re)initializes (its own
// event handler fires) after `insertRoot()` swaps its parent branch in.
import { createSignal } from '@barefootjs/client'

export function Badge({ label }: { label: string }) {
  const [clicks, setClicks] = createSignal(0)
  return (
    <span className="badge" onClick={() => setClicks(n => n + 1)}>
      {label}:{clicks()}
    </span>
  )
}
