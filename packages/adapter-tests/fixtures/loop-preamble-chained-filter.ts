import { createFixture } from '../src/types'

/**
 * The two ORDERING claims the per-row preamble lowering makes (#2447), in one
 * shape that would render wrong on any adapter that got either backwards:
 *
 *  1. **Declarations render in source order**, so a later initializer sees an
 *     earlier local. `cls` reads `base`; an adapter that emitted them in any
 *     other order (or hoisted them out of the row) renders `class="-open"` or
 *     an empty class instead of `write it-open`.
 *  2. **They render INSIDE the filter guard**, matching JS: a
 *     `.filter(p).map(cb)` chain never runs `cb`'s body for a filtered-out
 *     item. Not observable in the output HTML — a filtered row emits nothing
 *     either way — but observable as a runtime error on a strict backend if a
 *     declaration dereferenced something only the kept rows have, so the
 *     placement is pinned by the emitted templates and this fixture keeps the
 *     chained shape compiling and rendering on every backend.
 *
 * The single-declaration base case is `loop-preamble-attr-value`; the
 * preamble-before-branches case is `map-preamble-branch-body`.
 */
export const fixture = createFixture({
  id: 'loop-preamble-chained-filter',
  description: 'Chained .map() preamble locals in a .filter().map() row',
  componentName: 'LoopPreambleChainedFilter',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function LoopPreambleChainedFilter(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  return (
    <ul>
      {rows().filter(r => !r.done).map(row => {
        const base = row.label
        const cls = base + '-open'
        return (
          <li key={row.id} class={cls}>{row.label}</li>
        )
      })}
    </ul>
  )
}
`,
  props: {
    rows: [
      { id: 1, label: 'write it', done: false },
      { id: 2, label: 'ship it', done: true },
      { id: 3, label: 'sign it', done: false },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" class="write it-open" data-key="1"><!--bf:s0-->write it<!--/--></li>
      <li bf="s1" class="sign it-open" data-key="3"><!--bf:s0-->sign it<!--/--></li>
    </ul>
  `,
  dataPoints: [
    { name: 'empty', props: { rows: [] } },
    { name: 'all-done', props: { rows: [{ id: 9, label: 'done', done: true }] } },
  ],
})
