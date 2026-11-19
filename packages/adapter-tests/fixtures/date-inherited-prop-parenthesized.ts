import { createFixture } from '../src/types'

/**
 * A parenthesized constituent of an intersection alias still contributes its members. (#3914)
 */
export const fixture = createFixture({
  id: 'date-inherited-prop-parenthesized',
  description: 'Date prop through a parenthesized, nested intersection: getUTCFullYear() renders via the date helper',
  source: `
interface Base { at: Date }
type Props = (Base) & { label: string }
function DateInheritedPropParenthesized(props: Props) {
  return <p>{props.label}:{props.at.getUTCFullYear()}</p>
}
export { DateInheritedPropParenthesized }
`,
  props: { label: 'y', at: new Date('2024-05-06T00:00:00Z') },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
