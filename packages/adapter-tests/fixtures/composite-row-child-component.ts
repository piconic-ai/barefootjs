import { createFixture } from '../src/types'

/**
 * Composite loop row (`useElementReconciliation` + `nestedComponents`):
 * a signal-driven `.map()` whose row ROOT is a plain element and whose
 * subtree contains a child component. Rows are string-template built,
 * then each nested child is initialised via `upsertChild`.
 *
 * The child is declared in the SAME file on purpose — a sibling-module
 * child used inside a loop is refused by every DSL adapter with BF103.
 *
 * Before this fixture the composite-plus-nested-child combination had NO
 * coverage: of the five fixtures that select the composite plan, all five
 * had `nestedComponents === 0`, and no client-JS snapshot contained both
 * `mapArray` and `upsertChild`.
 *
 * Hono, every DSL adapter, and CSR all match (#2444 — the scope id of a
 * component nested below the loop row root now derives from
 * `<parent>_<slot>`, same as any other slotted child). Go still diverges
 * and is declared as a render divergence:
 *   - #2445 — Go hoists ONE `BadgeSlot0` props value outside `{{range}}`
 *     with no per-row data, so every row renders an empty badge.
 */
export const fixture = createFixture({
  id: 'composite-row-child-component',
  description: 'Dynamic loop row root is an element containing a child component',
  componentName: 'CompositeRowChildComponent',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; label: string }
function Badge(props: { text: string }) {
  return <span class="badge">{props.text}</span>
}
export function CompositeRowChildComponent(props: { items: Item[] }) {
  const [rows, setRows] = createSignal<Item[]>(props.items)
  return (
    <ul>
      {rows().map(row => (
        <li key={row.id}>
          <Badge text={row.label} />
        </li>
      ))}
    </ul>
  )
}
`,
  props: { items: [{ id: 1, label: 'one' }, { id: 2, label: 'two' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="1"><span bf-s="test_s0" bf="s1" class="badge"><!--bf:s0-->one<!--/--></span></li>
      <li data-key="2"><span bf-s="test_s0" bf="s1" class="badge"><!--bf:s0-->two<!--/--></span></li>
    </ul>
  `,
})
