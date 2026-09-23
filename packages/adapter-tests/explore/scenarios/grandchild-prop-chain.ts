/**
 * Scenario: a parent signal forwarded through TWO component boundaries
 * (#3046, component depth 2).
 *
 * `Mid` renders the label itself and passes it on to `Leaf`, which
 * renders it as text and gates a conditional on it. Every other child
 * scenario stops at one boundary, so a prop that reaches the first child
 * reactively but is frozen when forwarded again was never exercised.
 */

import type { Scenario } from '../scenario'

interface State {
  label: string
}

type Action = 'setA' | 'setB' | 'clear'

export const grandchildPropChain: Scenario<State, Action> = {
  id: 'grandchild-prop-chain',
  description: 'a parent signal forwarded as a prop through a child into a grandchild text slot and conditional',
  componentName: 'GrandchildPropChain',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type State = { label: string }

function Leaf({ label }: { label: string }) {
  return (
    <p aria-label="leaf">
      {label}
      {label !== '' && <em>set</em>}
    </p>
  )
}

function Mid({ label }: { label: string }) {
  return (
    <section>
      <h3>{label}</h3>
      <Leaf label={label} />
    </section>
  )
}

export function GrandchildPropChain({ initial }: { initial: State }) {
  const [label, setLabel] = createSignal(initial.label)
  return (
    <div>
      <Mid label={label()} />
      <button data-action="setA" onClick={() => setLabel('a')}>setA</button>
      <button data-action="setB" onClick={() => setLabel('b')}>setB</button>
      <button data-action="clear" onClick={() => setLabel('')}>clear</button>
    </div>
  )
}
`,
  initialState: { label: '' },
  actions: ['setA', 'setB', 'clear'],
  stateSignals: ['label'],
  reduce(_state, action) {
    return { label: action === 'setA' ? 'a' : action === 'setB' ? 'b' : '' }
  },
  bounds: { maxDepth: 2 },
}
