import type { Scenario } from '../scenario'

interface State {
  data: {
    label: string
  }
}

type Action = 'load' | 'clear'

export const childPropSlots: Scenario<State, Action> = {
  id: 'child-prop-slots',
  description: 'a child owns a prop-derived text slot; starts empty',
  componentName: 'ChildPropSlots',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Data = { label: string }
type State = { data: Data }

function Child({ data }: { data: Data }) {
  return <p aria-label="label">{data.label}</p>
}

export function ChildPropSlots({ initial }: { initial: State }) {
  const [data, setData] = createSignal<Data>(initial.data)
  return (
    <div>
      <Child data={data()} />
      <button data-action="load" onClick={() => setData({ label: 'loaded' })}>load</button>
      <button data-action="clear" onClick={() => setData({ label: '' })}>clear</button>
    </div>
  )
}
`,
  initialState: { data: { label: '' } },
  actions: ['load', 'clear'],
  stateSignals: ['data'],
  reduce(_state, action) {
    return action === 'load'
      ? { data: { label: 'loaded' } }
      : { data: { label: '' } }
  },
  bounds: { maxDepth: 2 },
}
