import { createFixture } from '../src/types'

/**
 * The Date member is declared by the object literal arm, the named arm carries the rest. (#3938)
 */
export const fixture = createFixture({
  id: 'date-inherited-prop-inline-intersection-literal',
  description: 'Date prop declared in an object literal arm of an inline intersection renders via the date helper',
  source: `
interface Named { label: string }
function DateInlineIntersectionLiteral(props: Named & { at: Date }) {
  return <p>{props.label}:{props.at.getUTCFullYear()}</p>
}
export { DateInlineIntersectionLiteral }
`,
  props: { label: 'y', at: new Date('2024-05-06T00:00:00Z') },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2024<!--/--></p>
  `,
})
