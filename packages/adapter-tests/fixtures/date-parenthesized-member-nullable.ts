import { createFixture } from '../src/types'

/**
 * Date reached through a props member typed as a nullable union of a parenthesized type renders via the date helper (#3973)
 */
export const fixture = createFixture({
  id: 'date-parenthesized-member-nullable',
  description: 'Date reached through a props member typed as a nullable union of a parenthesized type renders via the date helper',
  source: `
type AB = { at: Date; label: string }
function DateParenthesizedMemberNullable(props: { data: (AB) | null }) {
  return <p>{props.data ? props.data.at.getUTCFullYear() : 'none'}</p>
}
export { DateParenthesizedMemberNullable }
`,
  props: { data: { label: 'y', at: new Date('2024-05-06T00:00:00Z') } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf-cond-start:s0--><!--bf:s1-->2024<!--/--><!--bf-cond-end:s0--></p>
  `,
})
