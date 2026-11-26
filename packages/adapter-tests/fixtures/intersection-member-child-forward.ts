import { createFixture } from '../src/types'

/**
 * A props member typed as an inline intersection, forwarded whole to a child
 * whose own prop is typed by the same inline intersection.
 */
export const fixture = createFixture({
  id: 'intersection-member-child-forward',
  description: 'A prop typed as an inline intersection forwarded to a child with the same intersection type renders its members there',
  source: `
import { Show } from './show'
type A = { label: string }
type B = { count: number }
function IntersectionMemberChildForward(props: { data: A & B }) {
  return <div><Show data={props.data} /></div>
}
export { IntersectionMemberChildForward }
`,
  components: {
    './show.tsx': `
type A = { label: string }
type B = { count: number }
export function Show({ data }: { data: A & B }) {
  return <p>{data.label}:{data.count}</p>
}
`,
  },
  props: { data: { label: 'y', count: 2 } },
  expectedHtml: `
    <div bf-s="test"><p bf-s="test_s0" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2<!--/--></p></div>
  `,
})
