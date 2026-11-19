import { createFixture } from '../src/types'

/**
 * Order-reversed twin of date-intersection-refine-base-first. (#3914)
 */
export const fixture = createFixture({
  id: 'date-intersection-refine-base-last',
  description: 'Intersection where the Date arm comes before Base.at: unknown: renders the year',
  source: `
interface Base { at: unknown }
type Props = { at: Date; label: string } & Base
function DateIntersectionRefineBaseLast(props: Props) {
  return <p>{props.label}:{props.at.getUTCFullYear()}</p>
}
export { DateIntersectionRefineBaseLast }
`,
  props: { label: 'y', at: new Date('2024-05-06T00:00:00Z') },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
