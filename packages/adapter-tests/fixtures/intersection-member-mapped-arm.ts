import { createFixture } from '../src/types'

/**
 * A props member typed as an inline intersection with a mapped-type constituent, whose keys are not properties.
 */
export const fixture = createFixture({
  id: 'intersection-member-mapped-arm',
  description: 'Members of an inline intersection whose constituent is a mapped type render their values',
  source: `
type K = 'extra'
type A = { [P in K]: string }
type B = { label: string }
function IntersectionMemberMappedArm(props: { data: A & B }) {
  return <p>{props.data.label}:{props.data.extra}</p>
}
export { IntersectionMemberMappedArm }
`,
  props: { data: { label: 'label', extra: 'extra' } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->label<!--/-->:<!--bf:s1-->extra<!--/--></p>
  `,
})
