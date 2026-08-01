import { createFixture } from '../src/types'

/**
 * Composite loop row (`useElementReconciliation` + `nestedComponents`) whose
 * nested child has a `createMemo` DERIVED from the per-row-overridden prop
 * (#2448, the narrower gap the `composite-row-child-component` fixture's
 * docstring calls out as NOT covered there).
 *
 * `Badge`'s `dbl` memo is computed once, at `NewBadgeProps` construction
 * time, from `in.N`. The Go template adapter builds the shared
 * `$.BadgeSlot0` instance ONCE outside `{{range}}`, and `bf_with_props`
 * (#2445) re-applies only the NAMED fields on it — it cannot re-run
 * `NewBadgeProps`. Overriding `N` that way would leave `Dbl` holding row 0's
 * value (`0 * 2 = 0`) on every row: silently wrong output.
 *
 * Go therefore takes the rebuild path for this shape: the compiler emits a
 * props rebuilder for `Badge` and the row calls `bf_reprops`, which re-runs
 * the real constructor per row so `Dbl` recomputes (#2448). Every other
 * adapter (and CSR) constructs the child fresh per row and never had the
 * problem. `expectedHtml` is generated from the reference Hono adapter and
 * every adapter, Go included, must now show `Dbl` computed per row — 6 and
 * 10, not 0 and 0.
 */
export const fixture = createFixture({
  id: 'composite-row-child-derived-prop',
  description: 'Nested child in a dynamic loop row has a memo derived from the per-row-overridden prop',
  componentName: 'CompositeRowChildDerivedProp',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
type Row = { id: number; label: string; n: number }
function Badge(props: { text: string; n: number }) {
  const dbl = createMemo(() => props.n * 2)
  return <span class="badge">{props.text}:{dbl()}</span>
}
export function CompositeRowChildDerivedProp(props: { rows: Row[] }) {
  const [rows] = createSignal<Row[]>(props.rows)
  return (
    <ul>
      {rows().map(row => (
        <li key={row.id}>
          <Badge text={row.label} n={row.n} />
        </li>
      ))}
    </ul>
  )
}
`,
  props: { rows: [{ id: 1, label: 'one', n: 3 }, { id: 2, label: 'two', n: 5 }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="1"><span bf-s="test_s0" bf="s2" class="badge"><!--bf:s0-->one<!--/-->:<!--bf:s1-->6<!--/--></span></li>
      <li data-key="2"><span bf-s="test_s0" bf="s2" class="badge"><!--bf:s0-->two<!--/-->:<!--bf:s1-->10<!--/--></span></li>
    </ul>
  `,
})
