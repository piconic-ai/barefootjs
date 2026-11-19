import { createFixture } from '../src/types'

/**
 * Same as the inline intersection fixture with the base as the last arm. (#3938)
 */
export const fixture = createFixture({
  id: 'date-inherited-prop-inline-intersection-base-last',
  description: 'Date prop declared on the last arm of an inline intersection props type renders via the date helper',
  source: `
interface Base { at: Date }
function DateInlineIntersectionBaseLast(props: { label: string } & Base) {
  return <p>{props.label}:{props.at.getUTCFullYear()}</p>
}
export { DateInlineIntersectionBaseLast }
`,
  props: { label: 'y', at: new Date('2024-05-06T00:00:00Z') },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
