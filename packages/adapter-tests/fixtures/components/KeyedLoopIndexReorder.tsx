'use client'

// Test fixture (#2859): a keyed `.map()` row whose output depends on its
// OWN INDEX — a `{String(i + 1)}` badge and a `class={selected() === i
// ? ... : ...}` comparison against an outer signal — while the row's
// KEY tracks the underlying item, not its position.
//
// Before the fix, `mapArray`'s per-row scope handed `renderItem` a plain
// number for the index, frozen at the row's creation time. A same-key
// reorder (`rotate` below) moves the row to a new position without ever
// re-creating it, so nothing re-ran the index-derived bindings: the badge
// kept showing its original number and the "selected" class stayed
// pinned to whichever row was created at that position first, not the
// row now actually sitting there.
//
// The fix threads the index through a signal (mirroring the existing item
// signal) and batches `setIndex` alongside `setItem` on every same-key
// diff, so `i()` always reads the row's CURRENT position (eager path).
//
// #2859 follow-on: a binding referencing the loop index no longer forces
// eager on its own (`lazy-row-eligibility.ts`'s per-binding gate was
// lifted) — this row has no ref/child component/inner loop, so it is
// LAZY-eligible too. There the index is tracked on `entry.index`
// (`LazyRowEntry`, `map-array-lazy.ts`) instead of a signal, and the
// runtime calls `applyItem` on a pure reorder (`LazyRowPlan.indexDriven`).
// Which path a given loop shape takes is decided by the OTHER bindings in
// the row (a ref/child component/inner loop still forces eager); this
// fixture's assertions hold on either path.
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

export function KeyedLoopIndexReorder() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Bravo' },
    { id: 3, label: 'Charlie' },
  ])
  const [selected, setSelected] = createSignal(0)

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
          <li key={row.id} class={selected() === i ? 'row selected' : 'row'}>
            <span class="badge">{String(i + 1)}</span>
            <span class="label">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
