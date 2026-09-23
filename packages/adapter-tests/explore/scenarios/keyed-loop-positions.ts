/**
 * Scenario: positional edits on a same-component keyed `.map()` (#3046).
 *
 * The first-slice loop scenarios only ever touch the END of the list
 * (`append` / `removeLast`) plus one reorder (`rotate`). Keyed
 * reconciliation is most fragile away from the tail — an insert or delete
 * at the head or middle shifts every later row, and a reorder that moves a
 * row in both directions at once (`swapEnds`, `reverse`) is where a
 * move-vs-recreate decision goes wrong. This scenario covers exactly those
 * positions, starting from three rows so every action has a real head,
 * middle and tail to act on.
 *
 * `nextId` mints fresh keys for the same reason as `keyed-loop-inline`.
 */

import type { Scenario } from '../scenario'
import type { Item } from './keyed-loop-inline'

export interface PositionsState {
  items: Item[]
  nextId: number
}

export type PositionsAction = 'prepend' | 'insertMid' | 'removeFirst' | 'removeMid' | 'swapEnds' | 'reverse'

export const POSITIONS_ACTIONS: readonly PositionsAction[] = [
  'prepend',
  'insertMid',
  'removeFirst',
  'removeMid',
  'swapEnds',
  'reverse',
]

/** Shared by `keyed-loop-positions` and `child-prop-loop-positions`. */
export function reducePositions(items: Item[], nextId: number, action: PositionsAction): { items: Item[]; nextId: number } {
  const fresh = { id: `n${nextId}`, label: `item ${nextId}` }
  const mid = Math.floor(items.length / 2)
  switch (action) {
    case 'prepend':
      return { items: [fresh, ...items], nextId: nextId + 1 }
    case 'insertMid':
      return { items: [...items.slice(0, mid), fresh, ...items.slice(mid)], nextId: nextId + 1 }
    case 'removeFirst':
      return { items: items.slice(1), nextId }
    case 'removeMid':
      return { items: items.filter((_, i) => i !== mid), nextId }
    case 'swapEnds':
      return { items: items.length > 1 ? [items[items.length - 1], ...items.slice(1, -1), items[0]] : items, nextId }
    case 'reverse':
      return { items: [...items].reverse(), nextId }
  }
}

export const POSITIONS_INITIAL: PositionsState = {
  items: [
    { id: 'n0', label: 'item 0' },
    { id: 'n1', label: 'item 1' },
    { id: 'n2', label: 'item 2' },
  ],
  nextId: 3,
}

export const keyedLoopPositions: Scenario<PositionsState, PositionsAction> = {
  id: 'keyed-loop-positions',
  description: 'keyed .map() over a same-component signal array: insert / delete at head and middle, swap ends, reverse',
  componentName: 'KeyedLoopPositions',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: string; label: string }
type State = { items: Item[]; nextId: number }

export function KeyedLoopPositions({ initial }: { initial: State }) {
  const [items, setItems] = createSignal<Item[]>(initial.items)
  const [nextId, setNextId] = createSignal(initial.nextId)
  return (
    <div>
      <ul>
        {items().map(item => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
      <p>{items().length} items</p>
      <button data-action="prepend" onClick={() => { setItems([{ id: 'n' + nextId(), label: 'item ' + nextId() }, ...items()]); setNextId(nextId() + 1) }}>prepend</button>
      <button data-action="insertMid" onClick={() => { setItems([...items().slice(0, Math.floor(items().length / 2)), { id: 'n' + nextId(), label: 'item ' + nextId() }, ...items().slice(Math.floor(items().length / 2))]); setNextId(nextId() + 1) }}>insertMid</button>
      <button data-action="removeFirst" onClick={() => setItems(items().slice(1))}>removeFirst</button>
      <button data-action="removeMid" onClick={() => setItems(items().filter((_, i) => i !== Math.floor(items().length / 2)))}>removeMid</button>
      <button data-action="swapEnds" onClick={() => setItems(items().length > 1 ? [items()[items().length - 1], ...items().slice(1, -1), items()[0]] : items())}>swapEnds</button>
      <button data-action="reverse" onClick={() => setItems([...items()].reverse())}>reverse</button>
    </div>
  )
}
`,
  initialState: POSITIONS_INITIAL,
  actions: POSITIONS_ACTIONS,
  stateSignals: ['items', 'nextId'],
  reduce: (state, action) => reducePositions(state.items, state.nextId, action),
  bounds: { maxDepth: 2 },
}
