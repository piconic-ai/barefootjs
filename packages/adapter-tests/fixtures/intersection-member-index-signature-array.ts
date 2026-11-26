import { createFixture } from '../src/types'

/**
 * An array prop whose element type is an inline intersection with an index-signature constituent, read in a loop row by a declared key.
 */
export const fixture = createFixture({
  id: 'intersection-member-index-signature-array',
  description: 'Rows of an array prop whose element type is an inline intersection with an index-signature constituent render their members',
  source: `
type A = { [key: string]: string }
type B = { id: string; label: string }
function IntersectionMemberIndexSignatureArray(props: { items: (A & B)[] }) {
  return <ul>{props.items.map(item => <li key={item.id}>{item.label}</li>)}</ul>
}
export { IntersectionMemberIndexSignatureArray }
`,
  props: { items: [{ id: 'a', label: 'x' }, { id: 'b', label: 'y' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><!--bf:s0-->x<!--/--></li>
      <li data-key="b"><!--bf:s0-->y<!--/--></li>
    </ul>
  `,
})
