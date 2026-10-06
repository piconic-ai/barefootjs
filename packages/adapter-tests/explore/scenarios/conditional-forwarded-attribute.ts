/**
 * Scenario: a reactive attribute on an element the component forwards as
 * a conditional child component's `children` (#3324). The element is
 * parent-owned (`bf="^sN"`) but renders inside the child's own `bf-s`
 * scope, so the conditional branch's attribute lookup must cross that
 * scope boundary — while still skipping a nested child's own slots
 * (#2316). `update` exercises the attribute effect, `toggle` the branch
 * removal and re-creation, and `toggle>update` / `toggle>toggle>update`
 * the effect re-bound by a client-created branch.
 */

import type { Scenario } from '../scenario'

export interface ConditionalForwardedAttributeState {
  show: boolean
  label: string
}

export type ConditionalForwardedAttributeAction = 'update' | 'toggle'

export const conditionalForwardedAttribute: Scenario<
  ConditionalForwardedAttributeState,
  ConditionalForwardedAttributeAction
> = {
  id: 'conditional-forwarded-attribute',
  description: 'reactive attribute on a parent-owned element forwarded into a conditional child: update / toggle',
  componentName: 'ConditionalForwardedAttribute',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type State = { show: boolean; label: string }

function Wrapper({ children }: { children?: unknown }) {
  return <section>{children}</section>
}

export function ConditionalForwardedAttribute({ initial }: { initial: State }) {
  const [show, setShow] = createSignal(initial.show)
  const [label, setLabel] = createSignal(initial.label)
  return (
    <div>
      {show() && (
        <Wrapper>
          <strong data-label={label()}>value</strong>
        </Wrapper>
      )}
      <button data-action="update" onClick={() => setLabel(label() === 'alpha' ? 'beta' : 'alpha')}>update</button>
      <button data-action="toggle" onClick={() => setShow(!show())}>toggle</button>
    </div>
  )
}
`,
  initialState: { show: true, label: 'alpha' },
  actions: ['update', 'toggle'],
  stateSignals: ['show', 'label'],
  reduce(state, action) {
    switch (action) {
      case 'update':
        return { ...state, label: state.label === 'alpha' ? 'beta' : 'alpha' }
      case 'toggle':
        return { ...state, show: !state.show }
    }
  },
  bounds: { maxDepth: 3 },
}
