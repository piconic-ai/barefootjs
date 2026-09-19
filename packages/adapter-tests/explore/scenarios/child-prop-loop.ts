/**
 * Scenario: the motivating shape from #3046 — a parent signal holding
 * `{ items }` passed across a component boundary as a prop, where the
 * CHILD owns the keyed `.map()`. The initial state is the empty array, so
 * the first `append` is the `empty → non-empty` transition the proposal
 * singles out: a compiler can pass the getter, render the empty loop and
 * hydrate cleanly, and still have installed no reconciliation path able
 * to create the first row.
 *
 * Same five actions and item shape as `keyed-loop-inline` (shared
 * `reduceItems`), so the two scenarios differ in exactly one thing: where
 * the loop lives relative to the signal.
 */

import type { Scenario } from '../scenario'
import { KEYED_LOOP_ACTIONS, reduceItems, type Item, type KeyedLoopAction } from './keyed-loop-inline'

export interface ChildPropLoopState {
  data: { items: Item[] }
  nextId: number
}

export const childPropLoop: Scenario<ChildPropLoopState, KeyedLoopAction> = {
  id: 'child-prop-loop',
  description: 'parent signal { items } passed as a prop to a child that owns the keyed .map(); starts empty',
  componentName: 'ChildPropLoop',
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

export function ChildPropLoop({ initial }: { initial: State }) {
  const [data, setData] = createSignal<Data>(initial.data)
  const [nextId, setNextId] = createSignal(initial.nextId)
  return (
    <div>
      <ItemList data={data()} />
      <p>{data().items.length} items</p>
      <button data-action="append" onClick={() => { setData({ items: [...data().items, { id: 'n' + nextId(), label: 'item ' + nextId() }] }); setNextId(nextId() + 1) }}>append</button>
      <button data-action="removeLast" onClick={() => setData({ items: data().items.slice(0, -1) })}>removeLast</button>
      <button data-action="clear" onClick={() => setData({ items: [] })}>clear</button>
      <button data-action="rotate" onClick={() => setData({ items: data().items.length > 1 ? [...data().items.slice(1), data().items[0]] : data().items })}>rotate</button>
      <button data-action="cloneAll" onClick={() => setData({ items: data().items.map(item => ({ ...item })) })}>cloneAll</button>
    </div>
  )
}
`,
  initialState: { data: { items: [] }, nextId: 0 },
  actions: KEYED_LOOP_ACTIONS,
  stateSignals: ['data', 'nextId'],
  reduce: (state, action) => {
    const next = reduceItems(state.data.items, state.nextId, action)
    return { data: { items: next.items }, nextId: next.nextId }
  },
  bounds: { maxDepth: 2 },
}
