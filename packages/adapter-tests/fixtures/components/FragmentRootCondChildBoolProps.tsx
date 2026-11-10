'use client'

// Test fixture: a Fragment-root component whose conditional branches sit
// directly under the fragment and each render a child component given
// reactive boolean props. The child's `disabled` / `hidden` attributes must
// follow the parent's signal after a CSR mount and after hydration — for a
// branch present at first render and for one entered later.

import { createSignal } from '@barefootjs/client'

function ActionButton({ name, disabled, hidden }: { name: string; disabled: boolean; hidden: boolean }) {
  return (
    <button className="child-action" data-name={name} disabled={disabled} hidden={hidden}>
      {name}
    </button>
  )
}

export function FragmentRootCondChildBoolProps() {
  const [shown] = createSignal(true)
  const [late, setLate] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  return (
    <>
      <button className="toggle" onClick={() => setBusy(!busy())}>{busy() ? 'busy' : 'idle'}</button>
      {shown() ? <ActionButton name="first" disabled={busy()} hidden={busy()} /> : null}
      <button className="enter" onClick={() => setLate(!late())}>enter</button>
      {late() ? <ActionButton name="late" disabled={busy()} hidden={busy()} /> : null}
    </>
  )
}
