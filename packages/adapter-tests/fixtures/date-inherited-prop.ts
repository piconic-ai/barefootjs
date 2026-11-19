import { createFixture } from '../src/types'

/**
 * A `Date` prop declared on a base interface and reached through `extends`
 * (#3914). The member is not in `Props`' own member list, so the date
 * lowering must resolve inherited members when deciding whether the props
 * type reaches `Date` and when typing the receiver `props.at`. Before the
 * fix the template adapters rendered the year as an empty string.
 */
export const fixture = createFixture({
  id: 'date-inherited-prop',
  description: 'Date prop inherited via interface extends: getUTCFullYear() renders via the date helper',
  source: `
interface Base { at: Date }
interface Props extends Base { label: string }
function DateInheritedProp(props: Props) {
  return <p>{props.label}:{props.at.getUTCFullYear()}</p>
}
export { DateInheritedProp }
`,
  props: { label: 'y', at: new Date('2024-05-06T00:00:00Z') },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
