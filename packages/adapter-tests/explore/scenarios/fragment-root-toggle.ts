/**
 * Scenario: the component's root is a Fragment (#3046, root-shape axis).
 *
 * Every other scenario wraps its output in one element, so the hydrate
 * path always has an element scope root. A Fragment root has none — the
 * scope is carried by comment markers around sibling nodes
 * (`isCommentScopedRoot`, `ir-to-client-js/utils.ts`) — and a conditional
 * and a text slot living directly under that comment scope are exactly
 * the nodes whose marker lookup differs from the element-rooted case.
 */

import type { Scenario } from '../scenario'

interface State {
  show: boolean
  label: string
}

type Action = 'toggle' | 'relabel'

export const fragmentRootToggle: Scenario<State, Action> = {
  id: 'fragment-root-toggle',
  description: 'Fragment-rooted component: a text slot and an && conditional directly under the comment scope',
  componentName: 'FragmentRootToggle',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type State = { show: boolean; label: string }

export function FragmentRootToggle({ initial }: { initial: State }) {
  const [show, setShow] = createSignal(initial.show)
  const [label, setLabel] = createSignal(initial.label)
  return (
    <>
      <p aria-label="label">{label()}</p>
      {show() && <span>shown</span>}
      <button data-action="toggle" onClick={() => setShow(!show())}>toggle</button>
      <button data-action="relabel" onClick={() => setLabel(label() === 'a' ? 'b' : 'a')}>relabel</button>
    </>
  )
}
`,
  initialState: { show: false, label: 'a' },
  actions: ['toggle', 'relabel'],
  stateSignals: ['show', 'label'],
  reduce(state, action) {
    return action === 'toggle' ? { ...state, show: !state.show } : { ...state, label: state.label === 'a' ? 'b' : 'a' }
  },
  bounds: { maxDepth: 3 },
}
