import { createFixture } from '../src/types'

/**
 * An inline object type with an index signature as the type of a member of a named object type (`type Row = { data: ... }`), in a client component whose payload carries the prop.
 */
export const fixture = createFixture({
  id: 'inline-object-prop-index-signature-named-owner',
  description: 'A member typed as an inline object type with an index signature, on a named type, renders and hydrates with its source keys',
  source: `
'use client'
type Row = { data: { label: string; [key: string]: string } }
function InlineObjectPropIndexSignatureNamedOwner(props: { row: Row }) {
  return <p onClick={() => console.log(props.row)}>{props.row.data.label}</p>
}
export { InlineObjectPropIndexSignatureNamedOwner }
`,
  props: { row: { data: { label: 'label' } } },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->label<!--/--></p>
  `,
})
