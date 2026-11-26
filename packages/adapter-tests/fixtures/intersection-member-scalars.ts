import { createFixture } from '../src/types'

/**
 * Scalar members read through a props member typed as an inline intersection (`data: A & B`), in text and in an attribute, with a fractional number.
 */
export const fixture = createFixture({
  id: 'intersection-member-scalars',
  description: 'String, number and boolean members of a props member typed as an inline intersection render their values',
  source: `
type A = { label: string }
type B = { count: number; on: boolean }
function IntersectionMemberScalars(props: { data: A & B }) {
  return <p title={props.data.label}>{props.data.label}:{props.data.count}:{props.data.on ? 'on' : 'off'}</p>
}
export { IntersectionMemberScalars }
`,
  props: { data: { label: 'y', count: 1.5, on: true } },
  expectedHtml: `
    <p bf-s="test" bf="s3" title="y"><!--bf:s0-->y<!--/-->:<!--bf:s1-->1.5<!--/-->:<!--bf-cond-start:s2-->on<!--bf-cond-end:s2--></p>
  `,
})
