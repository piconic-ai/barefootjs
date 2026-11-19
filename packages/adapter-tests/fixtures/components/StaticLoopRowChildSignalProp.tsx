'use client'

// Test fixture (#3921): a static array's `.map()` row holds a
// child component imported from another file, and the child gets a signal as
// a prop. The child's client JS has to be part of the page for the child to
// hydrate, so the parent must name the child (`@bf-child:SignalPropBadge`)
// even though no signal array and no composite reconciliation is involved.
// `plain` has the child in every row, `branch` and `else` put it in one arm
// of a row-only conditional.

import { createSignal } from '@barefootjs/client'
import { SignalPropBadge } from './SignalPropBadge'

interface Row {
  id: string
  kind: string
}

export function StaticLoopRowChildSignalProp() {
  const rows: Row[] = [
    { id: 'a', kind: 'on' },
    { id: 'b', kind: 'off' },
  ]
  const [n, setN] = createSignal(0)

  return (
    <div>
      <button type="button" class="inc" onClick={() => setN(n() + 1)}>
        inc
      </button>
      <ul class="plain">
        {rows.map(r => (
          <li key={r.id}>
            <SignalPropBadge n={n()} />
          </li>
        ))}
      </ul>
      <ul class="branch">
        {rows.map(r => (
          <li key={r.id}>{r.kind === 'on' ? <SignalPropBadge n={n()} /> : <i>off</i>}</li>
        ))}
      </ul>
      <ul class="else">
        {rows.map(r => (
          <li key={r.id}>{r.kind === 'on' ? <i>on</i> : <SignalPropBadge n={n()} />}</li>
        ))}
      </ul>
    </div>
  )
}
