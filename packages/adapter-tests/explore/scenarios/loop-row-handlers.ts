/**
 * Scenario: an event handler INSIDE each keyed row, acting on its own
 * row (#3046, per-row handlers).
 *
 * Every row renders a `bumpRow` button whose handler closes over the
 * row's `item`; the oracle clicks the first one (`interaction-runner.ts`
 * clicks `.first()`). The other actions reorder, prepend and remove rows,
 * so a later `bumpRow` must bump whichever row is FIRST NOW. A handler
 * bound to the row that was first at hydration, or to a stale `item`
 * snapshot, bumps the wrong row or writes a stale count.
 */

import type { Scenario } from '../scenario'

interface Row {
  id: string
  n: number
}

interface State {
  items: Row[]
  nextId: number
}

type Action = 'bumpRow' | 'prepend' | 'removeFirst' | 'reverse'

export const loopRowHandlers: Scenario<State, Action> = {
  id: 'loop-row-handlers',
  description: 'each keyed row has a handler that bumps its own row; the first row changes under reorder / prepend / remove',
  componentName: 'LoopRowHandlers',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Row = { id: string; n: number }
type State = { items: Row[]; nextId: number }

export function LoopRowHandlers({ initial }: { initial: State }) {
  const [items, setItems] = createSignal<Row[]>(initial.items)
  const [nextId, setNextId] = createSignal(initial.nextId)
  return (
    <div>
      <ul>
        {items().map(item => (
          <li key={item.id}>
            <span>{item.id}: {item.n}</span>
            <button data-action="bumpRow" onClick={() => setItems(items().map(x => (x.id === item.id ? { ...x, n: item.n + 1 } : x)))}>bump</button>
          </li>
        ))}
      </ul>
      <button data-action="prepend" onClick={() => { setItems([{ id: 'r' + nextId(), n: 0 }, ...items()]); setNextId(nextId() + 1) }}>prepend</button>
      <button data-action="removeFirst" onClick={() => setItems(items().length > 1 ? items().slice(1) : items())}>removeFirst</button>
      <button data-action="reverse" onClick={() => setItems([...items()].reverse())}>reverse</button>
    </div>
  )
}
`,
  initialState: {
    items: [
      { id: 'r0', n: 0 },
      { id: 'r1', n: 0 },
    ],
    nextId: 2,
  },
  actions: ['bumpRow', 'prepend', 'removeFirst', 'reverse'],
  stateSignals: ['items', 'nextId'],
  reduce(state, action) {
    const { items, nextId } = state
    switch (action) {
      case 'bumpRow':
        return { items: items.map((x, i) => (i === 0 ? { ...x, n: x.n + 1 } : x)), nextId }
      case 'prepend':
        return { items: [{ id: `r${nextId}`, n: 0 }, ...items], nextId: nextId + 1 }
      case 'removeFirst':
        // Never empties the list: with no row there is no bumpRow button to click.
        return { items: items.length > 1 ? items.slice(1) : items, nextId }
      case 'reverse':
        return { items: [...items].reverse(), nextId }
    }
  },
  bounds: { maxDepth: 3 },
}
