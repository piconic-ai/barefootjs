import { createFixture } from '../src/types'

/**
 * A loop row's optional boolean member as a plain attribute value
 * (`data-off={r.off}`) renders JS `String(boolean)`, `true` / `false`, and
 * is omitted on a row that lacks it. The absence half is
 * `loop-row-absent-optional-member-attr`.
 */
export const fixture = createFixture({
  id: 'loop-row-boolean-member-attr',
  description: 'A boolean loop-row member as an attribute value renders true / false and is omitted when absent',
  source: `
type Row = { id: number; off?: boolean }
export function LoopRowBooleanMemberAttr(props: { rows: Row[] }) {
  return <ul>{props.rows.map((r) => <li key={r.id} data-off={r.off}>{r.id}</li>)}</ul>
}
`,
  props: { rows: [{ id: 1, off: true }, { id: 2, off: false }, { id: 3 }] },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" data-key="1" data-off="true"><!--bf:s0-->1<!--/--></li>
      <li bf="s1" data-key="2" data-off="false"><!--bf:s0-->2<!--/--></li>
      <li bf="s1" data-key="3"><!--bf:s0-->3<!--/--></li>
    </ul>
  `,
})
