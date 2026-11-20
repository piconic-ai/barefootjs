import { createFixture } from '../src/types'

/**
 * A props member typed as an inline intersection (`data: A & B`) keeps the members of every arm, so a Date read through it is lowered. (#3949)
 */
export const fixture = createFixture({
  id: 'date-intersection-member',
  description: 'Date reached through a props member typed as an inline intersection renders via the date helper',
  source: `
type A = { at: Date }
type B = { label: string }
function DateIntersectionMember(props: { data: A & B }) {
  return <p>{props.data.label}:{props.data.at.getUTCFullYear()}</p>
}
export { DateIntersectionMember }
`,
  props: { data: { label: 'y', at: new Date('2024-05-06T00:00:00Z') } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
