import { createFixture } from '../src/types'

/**
 * An optional props member typed as an inline intersection (`data?: A & B`), read behind a presence check.
 */
export const fixture = createFixture({
  id: 'intersection-member-optional',
  description: 'An optional props member typed as an inline intersection renders its member when passed',
  source: `
type A = { label: string }
type B = { count: number }
function IntersectionMemberOptional(props: { data?: A & B }) {
  return <p>{props.data ? props.data.label : 'none'}</p>
}
export { IntersectionMemberOptional }
`,
  props: { data: { label: 'y', count: 2 } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf-cond-start:s0--><!--bf:s1-->y<!--/--><!--bf-cond-end:s0--></p>
  `,
})
