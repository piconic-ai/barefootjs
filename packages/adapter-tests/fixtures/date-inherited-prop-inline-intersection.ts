import { createFixture } from '../src/types'

/**
 * The props parameter is annotated with an inline intersection, not an alias. (#3938)
 */
export const fixture = createFixture({
  id: 'date-inherited-prop-inline-intersection',
  description: 'Date prop through an inline intersection props type: getUTCFullYear() renders via the date helper',
  source: `
interface Base { at: Date }
function DateInlineIntersection(props: Base & { label: string }) {
  return <p>{props.label}:{props.at.getUTCFullYear()}</p>
}
export { DateInlineIntersection }
`,
  props: { label: 'y', at: new Date('2024-05-06T00:00:00Z') },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
