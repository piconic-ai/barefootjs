import { createFixture } from '../src/types'

/**
 * Date reached through a props annotation that is itself parenthesized renders via the date helper (#3973)
 */
export const fixture = createFixture({
  id: 'date-parenthesized-props-type',
  description: 'Date reached through a props annotation that is itself parenthesized renders via the date helper',
  source: `
type AB = { at: Date; label: string }
function DateParenthesizedPropsType(props: ({ data: AB })) {
  return <p>{props.data.label}:{props.data.at.getUTCFullYear()}</p>
}
export { DateParenthesizedPropsType }
`,
  props: { data: { label: 'y', at: new Date('2024-05-06T00:00:00Z') } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
