/**
 * Scenario: a child component whose LIFETIME is driven by one parent
 * signal and whose PROP is driven by another (#3046, "child mount →
 * update → unmount"). Starts unmounted, so the first `mount` has to
 * construct the child client-side (no SSR markup to adopt), `relabel`
 * while mounted has to reach a child that was never hydrated from the
 * server, and `unmount` has to tear it down — including the
 * `mount>relabel>unmount` and `relabel>mount` orders, where the prop
 * changes while the child does not exist and must be correct on the next
 * mount.
 */

import type { Scenario } from '../scenario'

export interface ChildMountState {
  mounted: boolean
  label: string
}

export type ChildMountAction = 'mount' | 'unmount' | 'relabel'

export const childMountUnmount: Scenario<ChildMountState, ChildMountAction> = {
  id: 'child-mount-unmount',
  description: 'child component gated by one signal with a prop driven by another, starting unmounted: mount / unmount / relabel',
  componentName: 'ChildMountUnmount',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type State = { mounted: boolean; label: string }

function Badge({ label }: { label: string }) {
  return <span class="badge">{label}</span>
}

export function ChildMountUnmount({ initial }: { initial: State }) {
  const [mounted, setMounted] = createSignal(initial.mounted)
  const [label, setLabel] = createSignal(initial.label)
  return (
    <div>
      {mounted() && <Badge label={label()} />}
      <p>{label()}</p>
      <button data-action="mount" onClick={() => setMounted(true)}>mount</button>
      <button data-action="unmount" onClick={() => setMounted(false)}>unmount</button>
      <button data-action="relabel" onClick={() => setLabel(label() + '!')}>relabel</button>
    </div>
  )
}
`,
  initialState: { mounted: false, label: 'a' },
  actions: ['mount', 'unmount', 'relabel'],
  stateSignals: ['mounted', 'label'],
  reduce(state, action) {
    switch (action) {
      case 'mount':
        return { ...state, mounted: true }
      case 'unmount':
        return { ...state, mounted: false }
      case 'relabel':
        return { ...state, label: `${state.label}!` }
    }
  },
  // Depth 3 is what makes `mount>relabel>unmount` a single path.
  bounds: { maxDepth: 3 },
}
