import { createFixture } from '../src/types'

/**
 * The prop whose type is the inline intersection is destructured in the parameter list. (#3949)
 */
export const fixture = createFixture({
  id: 'date-intersection-member-destructured',
  description: 'Date reached through a destructured prop typed as an inline intersection renders via the date helper',
  source: `
type A = { at: Date }
type B = { label: string }
function DateIntersectionMemberDestructured({ data }: { data: A & B }) {
  return <p>{data.label}:{data.at.getUTCFullYear()}</p>
}
export { DateIntersectionMemberDestructured }
`,
  props: { data: { label: 'y', at: new Date('2024-05-06T00:00:00Z') } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
