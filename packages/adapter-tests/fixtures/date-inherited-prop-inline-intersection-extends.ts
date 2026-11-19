import { createFixture } from '../src/types'

/**
 * An inline intersection arm that itself extends a base interface. (#3938)
 */
export const fixture = createFixture({
  id: 'date-inherited-prop-inline-intersection-extends',
  description: 'Date prop inherited through extends of an inline intersection arm renders via the date helper',
  source: `
interface Base { at: Date }
interface Mid extends Base { id: string }
function DateInlineIntersectionExtends(props: Mid & { label: string }) {
  return <p>{props.label}:{props.at.getUTCFullYear()}</p>
}
export { DateInlineIntersectionExtends }
`,
  props: { label: 'y', at: new Date('2024-05-06T00:00:00Z') },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
