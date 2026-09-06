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
// diff, so `i()` always reads the row's CURRENT position. This binding
// shape (`referencesIndex: true` on the classified binding) is also
// unconditionally ineligible for the lazy row graph
// (`lazy-row-eligibility.ts`'s per-binding gate) — `applyItem`/
// `applyOuter` have no index parameter to give it — so this fixture
// exercises the eager `mapArray` path exclusively.

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

export function KeyedLoopIndexReorder() {
  const [rows, setRows] = createSignal<Row[]>(INITIAL)
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
