import { createFixture } from '../src/types'

/**
 * A props member typed as an inline intersection with an instantiated generic constituent (`Box<string>`).
 */
export const fixture = createFixture({
  id: 'intersection-member-generic-arm',
  description: 'Members of an inline intersection with a generic constituent render their values',
  source: `
type Box<T> = { value: T }
type B = { label: string }
function IntersectionMemberGenericArm(props: { data: Box<string> & B }) {
  return <p>{props.data.label}:{props.data.value}</p>
}
export { IntersectionMemberGenericArm }
`,
  props: { data: { label: 'label', value: 'v' } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->label<!--/-->:<!--bf:s1-->v<!--/--></p>
  `,
})
