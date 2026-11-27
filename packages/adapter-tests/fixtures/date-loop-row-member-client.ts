import { createFixture } from '../src/types'

/**
 * `client-directive` escape for `date-loop-row-member`: the row field is
 * revived with `new Date(...)` inside a `/* @client *\/` read. The row
 * crosses the `bf-p` boundary as JSON, so the field arrives as its ISO
 * string; a bare `/* @client *\/ r.at.getUTCFullYear()` would throw at
 * hydrate. SSR leaves the slot empty.
 */
export const fixture = createFixture({
  id: 'date-loop-row-member-client',
  description: 'BF021 escape for a Date read on a loop row: /* @client */ with an explicit new Date(...) revival',
  source: `
type Row = { id: string; at: Date }
export function DateLoopRowMemberClient(props: { rows: Row[] }) {
  return <ul>{props.rows.map(r => <li key={r.id}>{/* @client */ new Date(r.at).getUTCFullYear()}</li>)}</ul>
}
`,
  props: { rows: [{ id: 'a', at: '2024-01-01T00:00:00.000Z' }, { id: 'b', at: '2025-06-15T12:00:00.000Z' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><!--bf:s0--><!--/--></li>
      <li data-key="b"><!--bf:s0--><!--/--></li>
    </ul>
  `,
})
