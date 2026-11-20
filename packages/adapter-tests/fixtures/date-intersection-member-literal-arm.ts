import { createFixture } from '../src/types'

/**
 * The Date is declared on the inline object literal arm of the member intersection, after a named arm, with parentheses around the nested arms. (#3949)
 */
export const fixture = createFixture({
  id: 'date-intersection-member-literal-arm',
  description: 'Date declared on the object literal arm of a member intersection renders via the date helper',
  source: `
interface Named { label: string }
function DateIntersectionMemberLiteralArm(props: { data: (Named & { id: string }) & { at: Date } }) {
  return <p>{props.data.label}:{props.data.at.getUTCFullYear()}</p>
}
export { DateIntersectionMemberLiteralArm }
`,
  props: { data: { label: 'y', id: 'i', at: new Date('2024-05-06T00:00:00Z') } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
