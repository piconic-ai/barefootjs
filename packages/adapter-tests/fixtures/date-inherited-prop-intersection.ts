import { createFixture } from '../src/types'

/**
 * Same as `date-inherited-prop`, but the `Date` member arrives through an
 * intersection alias (`type Props = Base & { label: string }`) (#3914).
 */
export const fixture = createFixture({
  id: 'date-inherited-prop-intersection',
  description: 'Date prop reached through an intersection type: getUTCFullYear() renders via the date helper',
  source: `
interface Base { at: Date }
type Props = Base & { label: string }
function DateInheritedPropIntersection(props: Props) {
  return <p>{props.label}:{props.at.getUTCFullYear()}</p>
}
export { DateInheritedPropIntersection }
`,
  props: { label: 'y', at: new Date('2024-05-06T00:00:00Z') },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
