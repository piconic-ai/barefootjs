import { createFixture } from '../src/types'

/**
 * An inline intersection with an index-signature constituent as the type of a member of a named object type, in a client component whose payload carries the prop.
 */
export const fixture = createFixture({
  id: 'intersection-member-index-signature-named-owner',
  description: 'A member typed as an inline intersection with an index-signature constituent, on a named type, renders and hydrates with its source keys',
  source: `
'use client'
type A = { [key: string]: string }
type B = { label: string }
type Row = { data: A & B }
function IntersectionMemberIndexSignatureNamedOwner(props: { row: Row }) {
  return <p onClick={() => console.log(props.row)}>{props.row.data.label}</p>
}
export { IntersectionMemberIndexSignatureNamedOwner }
`,
  props: { row: { data: { label: 'label' } } },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->label<!--/--></p>
  `,
})
