import { createFixture } from '../src/types'

/**
 * The inline intersection is the type of a member of a named object type (`type Row = { data: A & B }`), read two levels deep.
 */
export const fixture = createFixture({
  id: 'intersection-member-named-owner',
  description: 'A member typed as an inline intersection on a named object type renders its members',
  source: `
type A = { label: string }
type B = { count: number }
type Row = { data: A & B }
function IntersectionMemberNamedOwner(props: { row: Row }) {
  return <p>{props.row.data.label}:{props.row.data.count}</p>
}
export { IntersectionMemberNamedOwner }
`,
  props: { row: { data: { label: 'y', count: 2 } } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2<!--/--></p>
  `,
})
