import { createFixture } from '../src/types'

/**
 * A props spread onto a child that declares only some of the parent's
 * params: `own` is the parent's alone, so the child never reads it, and an
 * explicit `size` the spread doesn't carry keeps its value.
 */
export const fixture = createFixture({
  id: 'component-spread-props-subset',
  description: "A props spread onto a child that declares only some of the parent's params",
  source: `
import { Tag } from './tag'
export function SpreadSubset(props: { label?: string; size?: string; own?: string }) {
  return <p data-own={props.own}><Tag size="s" {...props} /></p>
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { label?: string; size?: string }) {
  return <b data-size={props.size}>{props.label}</b>
}
`,
  },
  props: { label: 'hello', own: 'x' },
  expectedHtml: `
    <p bf-s="test" bf="s1" data-own="x"><b bf-s="test_s0" bf="s1" data-size="s"><!--bf:s0-->hello<!--/--></b></p>
  `,
})
