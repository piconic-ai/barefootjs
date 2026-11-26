import { createFixture } from '../src/types'

/**
 * A props member typed as an inline intersection with a constituent that has
 * an index signature, read by a key no constituent declares.
 */
export const fixture = createFixture({
  id: 'intersection-member-index-signature',
  description: 'A key read through an inline intersection member with an index-signature constituent renders its value',
  source: `
type A = { [key: string]: string }
type B = { label: string }
function IntersectionMemberIndexSignature(props: { data: A & B }) {
  return <p>{props.data.label}:{props.data['extra']}</p>
}
export { IntersectionMemberIndexSignature }
`,
  props: { data: { label: 'label', extra: 'extra' } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->label<!--/-->:<!--bf:s1-->extra<!--/--></p>
  `,
})
