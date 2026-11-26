import { createFixture } from '../src/types'

/**
 * Date reached through an interface member typed as a doubly parenthesized type renders via the date helper (#3973)
 */
export const fixture = createFixture({
  id: 'date-parenthesized-member-nested',
  description: 'Date reached through an interface member typed as a doubly parenthesized type renders via the date helper',
  source: `
type AB = { at: Date; label: string }
interface Props { data: ((AB)) }
function DateParenthesizedMemberNested(props: Props) {
  return <p>{props.data.label}:{props.data.at.getUTCFullYear()}</p>
}
export { DateParenthesizedMemberNested }
`,
  props: { data: { label: 'y', at: new Date('2024-05-06T00:00:00Z') } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
