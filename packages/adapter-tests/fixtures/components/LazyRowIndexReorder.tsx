'use client'

// Test fixture (#2859 follow-on, the lazy-row-graph widening): a keyed
// `.map()` row whose badge text depends on the row's OWN INDEX
// (`{String(i + 1)}`), with no per-row imperative content (no ref, no child
// component, no inner loop) and no outer-signal read either — the plainest
// lazy-eligible shape. `keyed-loop-index-reorder`
// (`fixtures/components/KeyedLoopIndexReorder.tsx`, #2859's original
// fixture) turns out to be lazy-eligible too since the widening below, so
// this fixture's job is narrower: pin the widened behavior on a row with
// nothing ELSE going on, so a future regression here points straight at
// the index-tracking mechanism itself.
//
// Before the widening, ANY binding referencing the loop index forced the
// whole row onto the eager `mapArray` path outright (`lazy-row-eligibility.
// ts`'s per-binding gate). Now the index is tracked on `entry.index`
// (`LazyRowEntry`, `map-array-lazy.ts`) exactly like the item is on
// `entry.item`, so the reconciler calls `applyItem` on a pure reorder too
// (`LazyRowPlan.indexDriven`) — the row stays on the lazy path (no per-row
// signal/effect at all) AND still updates correctly across a same-key
// reorder.
//
// The initial rows are inlined directly into `createSignal<Row[]>([...])`
// rather than referenced from a separate module-level constant — the Go
// template adapter's signal-initializer seeding only resolves an INLINE
// array literal, not a reference to a named constant (a real, separate,
// pre-existing gap, not something this fixture is testing).

import { createSignal } from '@barefootjs/client'

interface Row {
  id: number
  label: string
}

export function LazyRowIndexReorder() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Bravo' },
    { id: 3, label: 'Charlie' },
  ])

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
