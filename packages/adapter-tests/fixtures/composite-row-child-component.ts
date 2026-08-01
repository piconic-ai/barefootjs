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
 * Every adapter now matches:
 *   - #2444 — Hono, every DSL adapter, and CSR: the scope id of a
 *     component nested below the loop row root now derives from
 *     `<parent>_<slot>`, same as any other slotted child (previously a
 *     freshly randomized `Badge_<id>` via `render_child` — content was
 *     always correct, only `bf-s` diverged).
 *   - #2445 — Go template: the shared `BadgeSlot0` props instance built
 *     outside `{{range}}` is now overridden per row, at
 *     template-execution time, via the `bf_with_props` runtime helper —
 *     see `packages/adapter-go-template/runtime/bf.go`. A child field
 *     DERIVED from the overridden prop (a memo, a signal initial value) needs
 *     more than a field patch and takes the `bf_reprops` rebuild path instead
 *     (#2448); this fixture's `Badge` has no such field, so it stays on
 *     `bf_with_props`. `composite-row-child-derived-prop` covers the other
 *     side.
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
