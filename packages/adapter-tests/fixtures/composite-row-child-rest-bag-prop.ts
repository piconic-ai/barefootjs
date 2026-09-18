import { createFixture } from '../src/types'

/**
 * Composite loop row (row root is a plain element) whose nested child
 * receives a PER-ROW value through a prop the child does not declare —
 * it lands in the child's rest bag (`{ text, ...rest }`) and is spread onto
 * the child's root element. The sibling of `composite-row-child-component`
 * (a declared field, re-applied per row through `bf_with_props` on Go) for
 * the rest-bag route.
 */
export const fixture = createFixture({
  id: 'composite-row-child-rest-bag-prop',
  description: 'Dynamic loop row root is an element containing a child whose per-row prop routes into its rest bag',
  componentName: 'CompositeRowChildRestBagProp',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; label: string }
function Badge({ text, ...rest }: { text: string; [key: string]: any }) {
  return <span class="badge" {...rest}>{text}</span>
}
export function CompositeRowChildRestBagProp(props: { items: Item[] }) {
  const [rows, setRows] = createSignal<Item[]>(props.items)
  return (
    <ul>
      {rows().map(row => (
        <li key={row.id}>
          <Badge text="x" title={row.label} />
        </li>
      ))}
    </ul>
  )
}
`,
  props: { items: [{ id: 1, label: 'one' }, { id: 2, label: 'two' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="1"><span bf-s="test_s0" bf="s1" class="badge" title="one"><!--bf:s0-->x<!--/--></span></li>
      <li data-key="2"><span bf-s="test_s0" bf="s1" class="badge" title="two"><!--bf:s0-->x<!--/--></span></li>
    </ul>
  `,
})
