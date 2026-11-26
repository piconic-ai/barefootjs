import { createFixture } from '../src/types'

/**
 * An array prop whose element type is an inline intersection (`items: (A & B)[]`), read in a loop row.
 */
export const fixture = createFixture({
  id: 'intersection-member-array',
  description: 'Rows of an array prop whose element type is an inline intersection render their members',
  source: `
type A = { id: string; label: string }
type B = { count: number }
function IntersectionMemberArray(props: { items: (A & B)[] }) {
  return <ul>{props.items.map(item => <li key={item.id}>{item.label}:{item.count}</li>)}</ul>
}
export { IntersectionMemberArray }
`,
  props: { items: [{ id: 'a', label: 'x', count: 1 }, { id: 'b', label: 'y', count: 2.5 }] },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="a"><!--bf:s0-->x<!--/-->:<!--bf:s1-->1<!--/--></li>
      <li data-key="b"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2.5<!--/--></li>
    </ul>
  `,
})
