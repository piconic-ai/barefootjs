import { createFixture } from '../src/types'

/**
 * Composite loop row (`useElementReconciliation` + `nestedComponents`)
 * whose nested child destructures its props with a RENAME (`{ n: count }`,
 * #2460) instead of a bare bind. This is the composite-row fixture #2457
 * (fixed on the Go side, merged as #2462) was blocked on — it could not
 * land without a fixture because Hono, the reference adapter that
 * generates `expectedHtml`, was itself the broken party for any aliased
 * prop (#2460's general defect, not composite-row-specific). With Hono
 * fixed, this exercises the aliased rename specifically INSIDE a keyed
 * `.map()` row, where a shared-instance or per-row-override bug would
 * show up as every row displaying the SAME `count` instead of its own —
 * hence per-row distinct `n` values (3 and 5, not identical).
 *
 * `expectedHtml` is generated from the reference Hono adapter.
 */
export const fixture = createFixture({
  id: 'composite-row-child-aliased-prop',
  description: 'Nested child in a dynamic loop row destructures a renamed prop ({ n: count })',
  componentName: 'CompositeRowChildAliasedProp',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; n: number }
function Badge({ text, n: count }: { text: string; n: number }) {
  return <span class="badge">{text}:{count}</span>
}
export function CompositeRowChildAliasedProp(props: { rows: Row[] }) {
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
      <li data-key="1"><span bf-s="test_s0" bf="s2" class="badge"><!--bf:s0-->one<!--/-->:<!--bf:s1-->3<!--/--></span></li>
      <li data-key="2"><span bf-s="test_s0" bf="s2" class="badge"><!--bf:s0-->two<!--/-->:<!--bf:s1-->5<!--/--></span></li>
    </ul>
  `,
})
