import { createFixture } from '../src/types'

/**
 * Parenthesized and nested arms of an inline intersection still contribute their members. (#3938)
 */
export const fixture = createFixture({
  id: 'date-inherited-prop-inline-intersection-nested',
  description: 'Date prop through a parenthesized, nested inline intersection renders via the date helper',
  source: `
interface Base { at: Date }
function DateInlineIntersectionNested(props: (Base & { id: string }) & { label: string }) {
  return <p>{props.label}:{props.at.getUTCFullYear()}</p>
}
export { DateInlineIntersectionNested }
`,
  props: { label: 'y', at: new Date('2024-05-06T00:00:00Z') },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
