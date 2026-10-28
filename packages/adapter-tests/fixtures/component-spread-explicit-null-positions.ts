import { createFixture } from '../src/types'

/**
 * An explicit `null` carried by `{...props}` after an explicit prop of the
 * same key, onto a child under a `&&` condition, a ternary branch and in a
 * loop row: each spread carries the key, so the `null` overrides `"first"`.
 */
export const fixture = createFixture({
  id: 'component-spread-explicit-null-positions',
  description: 'A props spread whose explicit null overrides an earlier explicit prop under a condition and in a loop',
  source: `
import { Tag } from './tag'
export function SpreadExplicitNullPositions(props: { label?: string | null; items: string[]; show: boolean }) {
  return (
    <div>
      {props.show && <Tag label="first" {...props} />}
      {props.show ? <Tag label="second" {...props} /> : <i>none</i>}
      <ul>{props.items.map((item) => <li key={item}><Tag label={item} {...props} /></li>)}</ul>
    </div>
  )
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { label?: string | null }) {
  return <b>{props.label ?? 'fallback'}</b>
}
`,
  },
  props: { label: null, items: ['a', 'b'], show: true },
  expectedHtml: `
    <div bf-s="test" bf="s6">
      <!--bf-cond-start:s0-->
      <b bf-s="test_s1" bf="s1"><!--bf:s0-->fallback<!--/--></b>
      <!--bf-cond-end:s0-->
      <!--bf-cond-start:s2-->
      <b bf-s="test_s3" bf="s1"><!--bf:s0-->fallback<!--/--></b>
      <!--bf-cond-end:s2-->
      <ul bf="s5">
        <li data-key="a"><b bf-s="test_s4" bf="s1"><!--bf:s0-->fallback<!--/--></b></li>
        <li data-key="b"><b bf-s="test_s4" bf="s1"><!--bf:s0-->fallback<!--/--></b></li>
      </ul>
    </div>
  `,
})
