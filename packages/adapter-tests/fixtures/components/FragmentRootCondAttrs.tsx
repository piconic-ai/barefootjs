'use client'

// Test fixture: a Fragment-root component whose conditional branches sit
// directly under the fragment, as top-level siblings of the component's
// first element. Reactive attributes inside the branches (`disabled`,
// `hidden`, `data-x`, `class`) must keep updating after a CSR mount and
// after hydration — both for a branch that is present at first render and
// for one that is absent at first render and entered later.

import { createSignal } from '@barefootjs/client'

export function FragmentRootCondAttrs() {
  const [shown] = createSignal(true)
  const [late, setLate] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  return (
    <>
      <button className="toggle" onClick={() => setBusy(!busy())}>{busy() ? 'busy' : 'idle'}</button>
      {shown() ? (
        <button className={busy() ? 'action on' : 'action off'} data-x={busy() ? 'yes' : 'no'} disabled={busy()} hidden={busy()}>
          action
        </button>
      ) : null}
      <button className="enter" onClick={() => setLate(!late())}>enter</button>
      {late() ? (
        <span className={busy() ? 'late on' : 'late off'} data-x={busy() ? 'yes' : 'no'} hidden={busy()}>
          late
        </span>
      ) : null}
    </>
  )
}
