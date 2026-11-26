import { createFixture } from '../src/types'

/**
 * Date reached through a destructured prop typed as a parenthesized inline object type renders via the date helper (#3973)
 */
export const fixture = createFixture({
  id: 'date-parenthesized-member-destructured',
  description: 'Date reached through a destructured prop typed as a parenthesized inline object type renders via the date helper',
  source: `
function DateParenthesizedMemberDestructured({ data }: { data: ({ at: Date; label: string }) }) {
  return <p>{data.label}:{data.at.getUTCFullYear()}</p>
}
export { DateParenthesizedMemberDestructured }
`,
  props: { data: { label: 'y', at: new Date('2024-05-06T00:00:00Z') } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
