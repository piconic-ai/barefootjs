import { createFixture } from '../src/types'

/**
 * The inline intersection is a member of a named props interface rather than of an inline props type. (#3949)
 */
export const fixture = createFixture({
  id: 'date-intersection-member-interface',
  description: 'Date reached through an interface member typed as an inline intersection renders via the date helper',
  source: `
interface A { at: Date }
interface B { label: string }
interface Props { data: A & B }
function DateIntersectionMemberInterface(props: Props) {
  return <p>{props.data.label}:{props.data.at.getUTCFullYear()}</p>
}
export { DateIntersectionMemberInterface }
`,
  props: { data: { label: 'y', at: new Date('2024-05-06T00:00:00Z') } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
