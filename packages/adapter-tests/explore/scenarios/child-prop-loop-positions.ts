/**
 * Scenario: `keyed-loop-positions`' positional edits, with the keyed
 * `.map()` owned by a CHILD that receives the array through a prop (the
 * `child-prop-loop` boundary). The two scenarios differ only in where the
 * loop lives relative to the signal, so a failure in exactly one of them
 * points at the prop boundary rather than at keyed reconciliation itself.
 */

import type { Scenario } from '../scenario'
import type { Item } from './keyed-loop-inline'
import { POSITIONS_ACTIONS, POSITIONS_INITIAL, reducePositions, type PositionsAction } from './keyed-loop-positions'

export interface ChildPropPositionsState {
  data: { items: Item[] }
  nextId: number
}

export const childPropLoopPositions: Scenario<ChildPropPositionsState, PositionsAction> = {
  id: 'child-prop-loop-positions',
  description: 'parent signal { items } passed as a prop to a child-owned keyed .map(): insert / delete at head and middle, swap ends, reverse',
  componentName: 'ChildPropLoopPositions',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: string; label: string }
type Data = { items: Item[] }
type State = { data: Data; nextId: number }

function ItemList({ data }: { data: Data }) {
  return (
    <ul>
      {data.items.map(item => (
        <li key={item.id}>{item.label}</li>
      ))}
    </ul>
  )
}

export function ChildPropLoopPositions({ initial }: { initial: State }) {
  const [data, setData] = createSignal<Data>(initial.data)
  const [nextId, setNextId] = createSignal(initial.nextId)
  return (
    <div>
      <ItemList data={data()} />
      <p>{data().items.length} items</p>
      <button data-action="prepend" onClick={() => { setData({ items: [{ id: 'n' + nextId(), label: 'item ' + nextId() }, ...data().items] }); setNextId(nextId() + 1) }}>prepend</button>
      <button data-action="insertMid" onClick={() => { setData({ items: [...data().items.slice(0, Math.floor(data().items.length / 2)), { id: 'n' + nextId(), label: 'item ' + nextId() }, ...data().items.slice(Math.floor(data().items.length / 2))] }); setNextId(nextId() + 1) }}>insertMid</button>
      <button data-action="removeFirst" onClick={() => setData({ items: data().items.slice(1) })}>removeFirst</button>
      <button data-action="removeMid" onClick={() => setData({ items: data().items.filter((_, i) => i !== Math.floor(data().items.length / 2)) })}>removeMid</button>
      <button data-action="swapEnds" onClick={() => setData({ items: data().items.length > 1 ? [data().items[data().items.length - 1], ...data().items.slice(1, -1), data().items[0]] : data().items })}>swapEnds</button>
      <button data-action="reverse" onClick={() => setData({ items: [...data().items].reverse() })}>reverse</button>
    </div>
  )
}
`,
  initialState: { data: { items: POSITIONS_INITIAL.items }, nextId: POSITIONS_INITIAL.nextId },
  actions: POSITIONS_ACTIONS,
  stateSignals: ['data', 'nextId'],
  reduce: (state, action) => {
    const next = reducePositions(state.data.items, state.nextId, action)
    return { data: { items: next.items }, nextId: next.nextId }
  },
  bounds: { maxDepth: 2 },
}
