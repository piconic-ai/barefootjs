import { createFixture } from '../src/types'

/**
 * A props member typed as an inline object type, forwarded whole to a child
 * whose own prop is typed by an inline object type of the same shape.
 */
export const fixture = createFixture({
  id: 'inline-object-prop-child-forward',
  description: 'A prop typed as an inline object type forwarded to a child with the same inline type renders its members there',
  source: `
import { Show } from './show'
function InlineObjectPropChildForward(props: { data: { label: string; count: number } }) {
  return <div><Show data={props.data} /></div>
}
export { InlineObjectPropChildForward }
`,
  components: {
    './show.tsx': `
export function Show({ data }: { data: { label: string; count: number } }) {
  return <p>{data.label}:{data.count}</p>
}
`,
  },
  props: { data: { label: 'y', count: 2 } },
  expectedHtml: `
    <div bf-s="test"><p bf-s="test_s0" bf="s2"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2<!--/--></p></div>
  `,
})
