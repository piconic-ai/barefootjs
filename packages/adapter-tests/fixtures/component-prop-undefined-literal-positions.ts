import { createFixture } from '../src/types'

/**
 * A child prop written as the literal `undefined` after a `{...props}`
 * spread that carries the same key: the later `undefined` wins, so the child
 * takes its fallback — at the top level, under `&&`, in a ternary branch, in
 * a loop row, and passed to a destructured child with a default. A child
 * that spreads its props over an earlier explicit prop of the same key is
 * `component-prop-undefined-literal-spread` (pinned on go-template).
 */
export const fixture = createFixture({
  id: 'component-prop-undefined-literal-positions',
  description: 'A literal undefined child prop overrides an earlier props-spread value in several positions',
  source: `
import { Tag } from './tag'
import { DMid } from './dmid'
export function PropUndefinedLiteralPositions(props: { label?: string; items: string[]; show: boolean }) {
  return (
    <div>
      <Tag {...props} label={undefined} />
      {props.show && <Tag {...props} label={undefined} />}
      {props.show ? <Tag {...props} label={undefined} /> : <i>none</i>}
      <ul>{props.items.map((item) => <li key={item}><Tag {...props} label={undefined} /></li>)}</ul>
      <DMid label={undefined} />
    </div>
  )
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { label?: string }) {
  return <b data-l={props.label ?? 'none'}>{props.label ?? 'fallback'}</b>
}
`,
    './dmid.tsx': `
import { Tag } from './tag'
export function DMid({ label = 'dflt' }: { label?: string }) {
  return <s><Tag label={label} /></s>
}
`,
  },
  props: { label: 'outer', items: ['a', 'b'], show: true },
  expectedHtml: `
    <div bf-s="test" bf="s8">
      <b bf-s="test_s0" bf="s1" data-l="none"><!--bf:s0-->fallback<!--/--></b>
      <!--bf-cond-start:s1-->
      <b bf-s="test_s2" bf="s1" data-l="none"><!--bf:s0-->fallback<!--/--></b>
      <!--bf-cond-end:s1-->
      <!--bf-cond-start:s3-->
      <b bf-s="test_s4" bf="s1" data-l="none"><!--bf:s0-->fallback<!--/--></b>
      <!--bf-cond-end:s3-->
      <ul bf="s6">
        <li data-key="a"><b bf-s="test_s5" bf="s1" data-l="none"><!--bf:s0-->fallback<!--/--></b></li>
        <li data-key="b"><b bf-s="test_s5" bf="s1" data-l="none"><!--bf:s0-->fallback<!--/--></b></li>
      </ul>
      <s bf-s="test_s7"><b bf-s="test_s7_s0" bf="s1" data-l="dflt"><!--bf:s0-->dflt<!--/--></b></s>
    </div>
  `,
})
