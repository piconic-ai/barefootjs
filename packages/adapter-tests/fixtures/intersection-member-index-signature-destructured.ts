import { createFixture } from '../src/types'

/**
 * A destructured prop typed as an inline intersection whose constituent has an index signature, read by a declared and by an undeclared key.
 */
export const fixture = createFixture({
  id: 'intersection-member-index-signature-destructured',
  description: 'Members of a destructured prop typed as an inline intersection with an index-signature constituent render their values',
  source: `
type A = { [key: string]: string }
type B = { label: string }
function IntersectionMemberIndexSignatureDestructured({ data }: { data: A & B }) {
  return <p>{data.label}:{data['extra']}</p>
}
export { IntersectionMemberIndexSignatureDestructured }
`,
  props: { data: { label: 'label', extra: 'extra' } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->label<!--/-->:<!--bf:s1-->extra<!--/--></p>
  `,
})
