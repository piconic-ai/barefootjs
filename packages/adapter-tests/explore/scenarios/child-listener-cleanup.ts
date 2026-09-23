/**
 * Scenario: a conditionally mounted child registers a window listener in
 * `onMount` and removes it in `onCleanup` (#3046, "removed branches
 * release subscriptions and listeners").
 *
 * The DOM oracles only compare markup, so a leak has to surface as markup
 * to be seen. Here it does: the listener calls a parent callback that
 * bumps a rendered counter, and the `ping` action dispatches the event.
 * While the child is unmounted a ping must change nothing; a listener
 * that outlives its branch keeps counting, and one registered twice
 * (`mount>unmount>mount` without cleanup) counts double. Either way the
 * counter diverges from a fresh render of the modelled state.
 *
 * `ping` reaches state only through the child's listener, so it is an
 * `indirectActions` entry.
 */

import type { Scenario } from '../scenario'

interface State {
  mounted: boolean
  count: number
}

type Action = 'mount' | 'unmount' | 'ping'

export const childListenerCleanup: Scenario<State, Action> = {
  id: 'child-listener-cleanup',
  description: 'a conditional child adds a window listener onMount and removes it onCleanup; pings while unmounted must not count',
  componentName: 'ChildListenerCleanup',
  source: `
'use client'
import { createSignal, onMount, onCleanup } from '@barefootjs/client'

type State = { mounted: boolean; count: number }

function Listener({ onPing }: { onPing: () => void }) {
  const handler = () => onPing()
  onMount(() => {
    window.addEventListener('explore-ping', handler)
  })
  onCleanup(() => {
    window.removeEventListener('explore-ping', handler)
  })
  return <span>listening</span>
}

export function ChildListenerCleanup({ initial }: { initial: State }) {
  const [mounted, setMounted] = createSignal(initial.mounted)
  const [count, setCount] = createSignal(initial.count)
  return (
    <div>
      {mounted() ? <Listener onPing={() => setCount(count() + 1)} /> : null}
      <p>{count()} pings</p>
      <button data-action="mount" onClick={() => setMounted(true)}>mount</button>
      <button data-action="unmount" onClick={() => setMounted(false)}>unmount</button>
      <button data-action="ping" onClick={() => window.dispatchEvent(new Event('explore-ping'))}>ping</button>
    </div>
  )
}
`,
  initialState: { mounted: true, count: 0 },
  actions: ['mount', 'unmount', 'ping'],
  indirectActions: ['ping'],
  stateSignals: ['mounted', 'count'],
  reduce(state, action) {
    switch (action) {
      case 'mount':
        return { ...state, mounted: true }
      case 'unmount':
        return { ...state, mounted: false }
      case 'ping':
        return state.mounted ? { ...state, count: state.count + 1 } : state
    }
  },
  bounds: { maxDepth: 3 },
}
