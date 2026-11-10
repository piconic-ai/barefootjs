'use client'

// Test fixture: a Fragment-root component whose conditional branches sit
// directly under the fragment, as top-level siblings of the component's
// first element. Reactive attributes inside the branches (`disabled`,
// `hidden`, `data-x`, `class`) must keep updating after a CSR mount and
// after hydration — both for a branch present at first render and for one
// that is absent at first render and entered later.
//
// Each branch element shares its `bf` slot id with the root of a sibling
// child component (`PresentBadge` / `LateBadge`; slot ids are numbered per
// component file). The branch's bindings must update the branch element and
// leave the child's root, which carries the same `bf` marker, untouched.

import { createSignal } from '@barefootjs/client'

function PresentBadge({ a, b, c, d }: { a: string; b: string; c: string; d: string }) {
  return (
    <i className="badge present" data-x={a}>
      {a}
      {b}
      {c}
      {d}
    </i>
  )
}

function LateBadge({ a, b, c, d, e, f, g, h }: Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h', string>) {
  return (
    <i className="badge late-badge" data-x={a}>
      {a}
      {b}
      {c}
      {d}
      {e}
      {f}
      {g}
      {h}
    </i>
  )
}

export function FragmentRootCondAttrs() {
  const [shown] = createSignal(true)
  const [late, setLate] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  return (
    <>
      <button className="toggle" onClick={() => setBusy(!busy())}>{busy() ? 'busy' : 'idle'}</button>
      <PresentBadge a="p" b="q" c="r" d="s" />
      {shown() ? (
        <button className={busy() ? 'action on' : 'action off'} data-x={busy() ? 'yes' : 'no'} disabled={busy()} hidden={busy()}>
          action
        </button>
      ) : null}
      <button className="enter" onClick={() => setLate(!late())}>enter</button>
      <LateBadge a="t" b="u" c="v" d="w" e="x" f="y" g="z" h="0" />
      {late() ? (
        <span className={busy() ? 'late on' : 'late off'} data-x={busy() ? 'yes' : 'no'} hidden={busy()}>
          late
        </span>
      ) : null}
    </>
  )
}
