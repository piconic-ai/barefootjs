import { createFixture } from '../src/types'

/**
 * `composite-row-child-rest-bag-prop` with the same-file child (`Badge`)
 * declared AFTER the parent that nests it in a loop row — legal through
 * function-declaration hoisting. Same contract: the per-row `title` routes
 * into the child's rest bag and is spread onto its root. Pins that a
 * template adapter's same-file child-shape registration does not depend on
 * the child being generated before its parent (declaration order).
 */
export const fixture = createFixture({
  id: 'composite-row-child-rest-bag-prop-hoisted',
  description: 'Loop-row child whose per-row prop routes into its rest bag, with the child declared after the parent',
  componentName: 'CompositeRowChildRestBagPropHoisted',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; label: string }
export function CompositeRowChildRestBagPropHoisted(props: { items: Item[] }) {
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
function Badge({ text, ...rest }: { text: string; [key: string]: any }) {
  return <span class="badge" {...rest}>{text}</span>
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
