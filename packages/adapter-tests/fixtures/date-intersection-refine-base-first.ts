import { createFixture } from '../src/types'

/**
 * In an intersection a member's type is the intersection of the arms' types: unknown on one side is refined by Date on the other, whichever comes first. (#3914)
 */
export const fixture = createFixture({
  id: 'date-intersection-refine-base-first',
  description: 'Intersection where Base.at is unknown and a later arm refines it to Date: renders the year',
  source: `
interface Base { at: unknown }
type Props = Base & { at: Date; label: string }
function DateIntersectionRefineBaseFirst(props: Props) {
  return <p>{props.label}:{props.at.getUTCFullYear()}</p>
}
export { DateIntersectionRefineBaseFirst }
`,
  props: { label: 'y', at: new Date('2024-05-06T00:00:00Z') },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
