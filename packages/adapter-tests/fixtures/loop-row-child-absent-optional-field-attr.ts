import { createFixture } from '../src/types'

/**
 * A loop-row child component fed a row's optional field (`tone={r.tone}`)
 * that the row omits: the child receives `undefined`, so its `class={tone}`
 * and `data-tone={tone}` are omitted. A row that supplies the field renders
 * both. The top-level and static-child forms are
 * `absent-optional-prop-class-attr`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-absent-optional-field-attr',
  description: 'A loop-row child fed an absent optional row field omits the attributes bound to it',
  source: `
import { Item } from './item'
type Row = { id: number; label: string; tone?: string }
export function LoopRowChildAbsentOptionalFieldAttr(props: { rows: Row[] }) {
  return <ul>{props.rows.map(r => <Item key={r.id} label={r.label} tone={r.tone} />)}</ul>
}
`,
  components: {
    './item.tsx': `
export function Item({ label, tone }: { label: string; tone?: string }) {
  return <li class={tone} data-tone={tone}>{label}</li>
}
`,
  },
  props: { rows: [{ id: 1, label: 'a', tone: 'x' }, { id: 2, label: 'b' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li bf-s="Item_*" bf="s1" class="x" data-key="1" data-tone="x"><!--bf:s0-->a<!--/--></li>
      <li bf-s="Item_*" bf="s1" data-key="2"><!--bf:s0-->b<!--/--></li>
    </ul>
  `,
})
