/**
 * Scenario: a keyed `.map()` loop over a signal array declared in the
 * SAME component that mutates it (#3046, "one passing keyed-loop
 * scenario"). The control scenario — the shape the corpus already covers
 * well (`empty-list-branch`, `keyed-loop-index-reorder`), so a failure
 * here points at the harness before it points at the compiler.
 *
 * State carries `nextId` alongside `items` so `append` mints a fresh key
 * even after `removeLast` — length-derived ids would collide after
 * `append>removeLast>append` and turn a keyed-identity test into a
 * duplicate-key test by accident.
 */

import type { Scenario } from '../scenario'

export interface Item {
  id: string
  label: string
}

export interface KeyedLoopState {
  items: Item[]
  nextId: number
}

export type KeyedLoopAction = 'append' | 'removeLast' | 'clear' | 'rotate' | 'cloneAll'

export const KEYED_LOOP_ACTIONS: readonly KeyedLoopAction[] = ['append', 'removeLast', 'clear', 'rotate', 'cloneAll']

/** Shared by both first-slice scenarios — the same five transitions over the same item shape. */
export function reduceItems(items: Item[], nextId: number, action: KeyedLoopAction): { items: Item[]; nextId: number } {
  switch (action) {
    case 'append':
      return { items: [...items, { id: `n${nextId}`, label: `item ${nextId}` }], nextId: nextId + 1 }
    case 'removeLast':
      return { items: items.slice(0, -1), nextId }
    case 'clear':
      return { items: [], nextId }
    case 'rotate':
      return { items: items.length > 1 ? [...items.slice(1), items[0]] : items, nextId }
    case 'cloneAll':
      // Structurally equal, referentially new — the "replace with
      // equal-looking values" transition. A keyed loop must keep its rows.
      return { items: items.map(item => ({ ...item })), nextId }
  }
}

export const keyedLoopInline: Scenario<KeyedLoopState, KeyedLoopAction> = {
  id: 'keyed-loop-inline',
  description: 'keyed .map() over a same-component signal array: append / removeLast / clear / rotate / cloneAll',
  componentName: 'KeyedLoopInline',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: string; label: string }
type State = { items: Item[]; nextId: number }

export function KeyedLoopInline({ initial }: { initial: State }) {
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
      <button data-action="append" onClick={() => { setItems([...items(), { id: 'n' + nextId(), label: 'item ' + nextId() }]); setNextId(nextId() + 1) }}>append</button>
      <button data-action="removeLast" onClick={() => setItems(items().slice(0, -1))}>removeLast</button>
      <button data-action="clear" onClick={() => setItems([])}>clear</button>
      <button data-action="rotate" onClick={() => setItems(items().length > 1 ? [...items().slice(1), items()[0]] : items())}>rotate</button>
      <button data-action="cloneAll" onClick={() => setItems(items().map(item => ({ ...item })))}>cloneAll</button>
    </div>
  )
}
`,
  initialState: {
    items: [
      { id: 'n0', label: 'item 0' },
      { id: 'n1', label: 'item 1' },
    ],
    nextId: 2,
  },
  actions: KEYED_LOOP_ACTIONS,
  stateSignals: ['items', 'nextId'],
  reduce: (state, action) => reduceItems(state.items, state.nextId, action),
  bounds: { maxDepth: 2 },
}
