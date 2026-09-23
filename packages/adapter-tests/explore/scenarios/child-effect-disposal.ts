/**
 * Scenario: a conditionally mounted child runs a `createEffect` that
 * tracks one of its props (#3046, "removed branches release
 * subscriptions").
 *
 * The effect reports every change of `label` after its first run to a
 * parent callback that bumps a rendered counter. While the child is
 * mounted, `relabel` must count; once it is unmounted the effect must be
 * disposed, so `relabel` changes only the label. A subscription that
 * outlives its branch keeps counting — visible as markup, so the ordinary
 * transition oracle catches it.
 *
 * The first-run guard keeps the effect's initial execution (which happens
 * at hydration or client mount, never at SSR) out of the counter, so SSR
 * and hydration agree on every state. `onChange` runs under `untrack` —
 * the parent's callback reads the counter it bumps, and tracking that read
 * would make the effect re-trigger itself.
 */

import type { Scenario } from '../scenario'

interface State {
  mounted: boolean
  label: string
  changes: number
}

type Action = 'mount' | 'unmount' | 'relabel'

export const childEffectDisposal: Scenario<State, Action> = {
  id: 'child-effect-disposal',
  description: 'a conditional child effect tracks a prop and reports changes; relabel after unmount must not count',
  componentName: 'ChildEffectDisposal',
  source: `
'use client'
import { createSignal, createEffect, untrack } from '@barefootjs/client'

type State = { mounted: boolean; label: string; changes: number }

function Watcher({ label, onChange }: { label: string; onChange: () => void }) {
  let first = true
  createEffect(() => {
    void label
    if (first) {
      first = false
      return
    }
    untrack(() => onChange())
  })
  return <span>watching {label}</span>
}

export function ChildEffectDisposal({ initial }: { initial: State }) {
  const [mounted, setMounted] = createSignal(initial.mounted)
  const [label, setLabel] = createSignal(initial.label)
  const [changes, setChanges] = createSignal(initial.changes)
  return (
    <div>
      {mounted() ? <Watcher label={label()} onChange={() => setChanges(changes() + 1)} /> : null}
      <p>{label()} / {changes()} changes</p>
      <button data-action="mount" onClick={() => setMounted(true)}>mount</button>
      <button data-action="unmount" onClick={() => setMounted(false)}>unmount</button>
      <button data-action="relabel" onClick={() => setLabel(label() === 'a' ? 'b' : 'a')}>relabel</button>
    </div>
  )
}
`,
  initialState: { mounted: true, label: 'a', changes: 0 },
  actions: ['mount', 'unmount', 'relabel'],
  stateSignals: ['mounted', 'label', 'changes'],
  reduce(state, action) {
    switch (action) {
      case 'mount':
        return { ...state, mounted: true }
      case 'unmount':
        return { ...state, mounted: false }
      case 'relabel':
        return {
          ...state,
          label: state.label === 'a' ? 'b' : 'a',
          changes: state.mounted ? state.changes + 1 : state.changes,
        }
    }
  },
  bounds: { maxDepth: 3 },
}
