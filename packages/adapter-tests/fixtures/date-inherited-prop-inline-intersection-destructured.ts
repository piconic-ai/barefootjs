import { createFixture } from '../src/types'

/**
 * The props are destructured in the parameter list of an inline intersection type. (#3938)
 */
export const fixture = createFixture({
  id: 'date-inherited-prop-inline-intersection-destructured',
  description: 'Date prop destructured from an inline intersection props type renders via the date helper',
  source: `
interface Base { at: Date }
function DateInlineIntersectionDestructured({ label, at }: Base & { label: string }) {
  return <p>{label}:{at.getUTCFullYear()}</p>
}
export { DateInlineIntersectionDestructured }
`,
  props: { label: 'y', at: new Date('2024-05-06T00:00:00Z') },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
