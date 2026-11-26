import { createFixture } from '../src/types'

/**
 * A props member typed as an inline intersection with a `Record<string, string>` constituent, read by a key no property declares.
 */
export const fixture = createFixture({
  id: 'intersection-member-record-arm',
  description: 'A key read through an inline intersection with a Record constituent renders its value',
  source: `
type B = { label: string }
function IntersectionMemberRecordArm(props: { data: Record<string, string> & B }) {
  return <p>{props.data.label}:{props.data['extra']}</p>
}
export { IntersectionMemberRecordArm }
`,
  props: { data: { label: 'label', extra: 'extra' } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->label<!--/-->:<!--bf:s1-->extra<!--/--></p>
  `,
})
