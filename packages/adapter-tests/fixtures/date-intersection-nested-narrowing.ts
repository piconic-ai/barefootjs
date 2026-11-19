import { createFixture } from '../src/types'

/**
 * A Date reached through a nested object whose own type intersects `Date`
 * with `Date | null` (#3914). The intersection of a type with a union that
 * contains it narrows to that type, so `data.at` is a `Date` and the call
 * lowers to the date helper at depth 2, not only on the root prop.
 */
export const fixture = createFixture({
  id: 'date-intersection-nested-narrowing',
  description: 'Nested Date member declared as Date & Date | null across intersection arms renders via the date helper',
  source: `
type Data = { at: Date } & { at: Date | null }
interface Props { data: Data; label: string }
function DateIntersectionNestedNarrowing(props: Props) {
  return <p>{props.label}:{props.data.at.getUTCFullYear()}</p>
}
export { DateIntersectionNestedNarrowing }
`,
  props: { label: 'y', data: { at: new Date('2024-05-06T00:00:00Z') } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
