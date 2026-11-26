import { createFixture } from '../src/types'

/**
 * `prop-precompute` escape for `date-loop-row-member`: each row carries the
 * accessor's result as a number field, computed server-side, and the loop
 * reads that field.
 */
export const fixture = createFixture({
  id: 'date-loop-row-member-precomputed',
  description: 'BF021 escape for a Date read on a loop row: the year pre-computed into a number field per row',
  source: `
type Row = { id: string; year: number }
export function DateLoopRowMemberPrecomputed(props: { rows: Row[] }) {
  return <ul>{props.rows.map(r => <li key={r.id}>{r.year}</li>)}</ul>
}
`,
  props: { rows: [{ id: 'a', year: 2024 }, { id: 'b', year: 2025 }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><!--bf:s0-->2024<!--/--></li>
      <li data-key="b"><!--bf:s0-->2025<!--/--></li>
    </ul>
  `,
})
