'use client'

// Test fixture: a child component rendered directly inside a reactive
// conditional branch that is ACTIVE when the page hydrates. The child
// registers a window listener in `onMount` and removes it in `onCleanup`;
// the listener bumps a counter the parent renders.
//
// Contract: one ping counts once while the child is mounted, and not at
// all once the branch is removed. Found by the bounded state-space
// exploration's `child-listener-cleanup` scenario (the child used to be
// initialized twice).

import { createSignal, onCleanup, onMount } from '@barefootjs/client'

function PingListener({ onPing }: { onPing: () => void }) {
  const handler = () => onPing()
  onMount(() => {
    window.addEventListener('fixture-ping', handler)
  })
  onCleanup(() => {
    window.removeEventListener('fixture-ping', handler)
  })
  return <span className="listener">listening</span>
}

export function ConditionalChildListenerCleanup() {
  const [mounted, setMounted] = createSignal(true)
  const [count, setCount] = createSignal(0)
  return (
    <div>
      {mounted() ? <PingListener onPing={() => setCount(count() + 1)} /> : null}
      <p className="count">{count()} pings</p>
      <button className="unmount" onClick={() => setMounted(false)}>unmount</button>
      <button className="ping" onClick={() => window.dispatchEvent(new Event('fixture-ping'))}>ping</button>
    </div>
  )
}
