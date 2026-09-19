/**
 * Scenario: a boolean signal gating two conditionals in the same
 * component — an `&&` block and a ternary — starting FALSE (#3046,
 * "conditional false → true"). The SSR document carries only the
 * conditional markers (and the ternary's false arm), so the first `show`
 * is the transition that has to CREATE the gated subtree from nothing,
 * then `hide` has to remove it again and `show>hide>show` has to do it
 * twice from a reconciled (not server-rendered) starting point.
 *
 * `toggle` is the same two transitions expressed as one action whose
 * direction depends on the current state — a second route to every
 * reachable state, so a handler that works only from its SSR-time branch
 * has nowhere to hide.
 */

import type { Scenario } from '../scenario'

export interface ConditionalToggleState {
  show: boolean
}

export type ConditionalToggleAction = 'show' | 'hide' | 'toggle'

export const conditionalToggle: Scenario<ConditionalToggleState, ConditionalToggleAction> = {
  id: 'conditional-toggle',
  description: 'boolean signal gating an && block and a ternary, starting false: show / hide / toggle',
  componentName: 'ConditionalToggle',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type State = { show: boolean }

export function ConditionalToggle({ initial }: { initial: State }) {
  const [show, setShow] = createSignal(initial.show)
  return (
    <div>
      {show() && (
        <section>
          <p>panel</p>
        </section>
      )}
      {show() ? <span>on</span> : <span>off</span>}
      <button data-action="show" onClick={() => setShow(true)}>show</button>
      <button data-action="hide" onClick={() => setShow(false)}>hide</button>
      <button data-action="toggle" onClick={() => setShow(!show())}>toggle</button>
    </div>
  )
}
`,
  initialState: { show: false },
  actions: ['show', 'hide', 'toggle'],
  stateSignals: ['show'],
  reduce(state, action) {
    switch (action) {
      case 'show':
        return { show: true }
      case 'hide':
        return { show: false }
      case 'toggle':
        return { show: !state.show }
    }
  },
  // Only two states exist, so a deeper bound is cheap and buys the
  // create → remove → create-again sequences (`show>hide>show`,
  // `toggle>toggle>toggle`) that a depth-2 sweep never reaches.
  bounds: { maxDepth: 3 },
}
