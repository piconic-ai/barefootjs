import { createFixture } from '../src/types'

/**
 * Date reached through a destructured prop whose props alias body is parenthesized renders via the date helper (#3973)
 */
export const fixture = createFixture({
  id: 'date-parenthesized-props-alias',
  description: 'Date reached through a destructured prop whose props alias body is parenthesized renders via the date helper',
  source: `
type AB = { at: Date; label: string }
type Props = ({ data: AB })
function DateParenthesizedPropsAlias({ data }: Props) {
  return <p>{data.label}:{data.at.getUTCFullYear()}</p>
}
export { DateParenthesizedPropsAlias }
`,
  props: { data: { label: 'y', at: new Date('2024-05-06T00:00:00Z') } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
