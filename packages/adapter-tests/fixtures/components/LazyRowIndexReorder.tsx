'use client'

// Test fixture (#2859 follow-on, the lazy-row-graph widening): a keyed
// `.map()` row whose badge text depends on the row's OWN INDEX
// (`{String(i + 1)}`), with no per-row imperative content (no ref, no child
// component, no inner loop) — so unlike `keyed-loop-index-reorder`
// (`fixtures/components/KeyedLoopIndexReorder.tsx`, #2859's original fixture,
// which ALSO reads an outer signal and is therefore refused from the lazy
// row graph for other reasons), this row is fully lazy-ELIGIBLE.
//
// Before the widening, ANY binding referencing the loop index forced the
// whole row onto the eager `mapArray` path outright (`lazy-row-eligibility.
// ts`'s per-binding gate). Now the index is tracked on `entry.index`
// (`LazyRowEntry`, `map-array-lazy.ts`) exactly like the item is on
// `entry.item`, so the reconciler calls `applyItem` on a pure reorder too
// (`LazyRowPlan.indexDriven`) — the row stays on the lazy path (no per-row
// signal/effect at all) AND still updates correctly across a same-key
// reorder.

import { createSignal } from '@barefootjs/client'

interface Row {
  id: number
  label: string
}

const INITIAL: Row[] = [
  { id: 1, label: 'Alpha' },
  { id: 2, label: 'Bravo' },
  { id: 3, label: 'Charlie' },
]

export function LazyRowIndexReorder() {
  const [rows, setRows] = createSignal<Row[]>(INITIAL)

  const rotate = () => {
    setRows(prev => {
      const [first, ...rest] = prev
      return [...rest, first]
    })
  }

  return (
    <div>
      <button type="button" class="rotate" onClick={rotate}>
        Rotate
      </button>
      <ul>
        {rows().map((row, i) => (
          <li key={row.id}>
            <span class="badge">{String(i + 1)}</span>
            <span class="label">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
