import { createFixture } from '../src/types'

/**
 * Every evaluator-lowered callback method with a body that reads `props.X`
 * through the props object (`function C(props)`): the evaluator env must bind
 * each `props.X` read, since a template has no `props` object. Includes an
 * index read keyed by a prop (`row[props.at]`). Sibling of
 * `memo-filter-prop-capture`, which covers `.filter` across positions.
 */
export const fixture = createFixture({
  id: 'callback-prop-capture-methods',
  description: 'evaluator callback bodies (some/every/find/findIndex/reduce/map/flatMap/toSorted) reading props.X',
  source: `
'use client'

export function CallbackPropCaptureMethods(props: { items: number[]; rows: string[][]; n: number; k: number; at: number; desc: boolean }) {
  return (
    <div>
      <p>{props.items.some((i) => i > props.n) ? 'some' : 'none'}</p>
      <p>{props.items.every((i) => i > props.n) ? 'every' : 'not-every'}</p>
      <p>{props.items.find((i) => i > props.n)}</p>
      <p>{props.items.findIndex((i) => i > props.n)}</p>
      <p>{props.items.reduce((acc, i) => acc + i * props.k, 0)}</p>
      <p>{props.items.map((i) => i * props.k).join(',')}</p>
      <p>{props.items.flatMap((i) => [i, props.k]).join(',')}</p>
      <p>{props.items.toSorted((a, b) => (props.desc ? b - a : a - b)).join(',')}</p>
      <p>{props.rows.map((row) => row[props.at] ?? '-').join(',')}</p>
    </div>
  )
}
`,
  props: {
    items: [1, 2.5, 3, 4],
    rows: [['a', 'b'], ['c'], ['d', 'e']],
    n: 2.5,
    k: 2,
    at: 1,
    desc: true,
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1"><!--bf-cond-start:s0-->some<!--bf-cond-end:s0--></p>
      <p bf="s3"><!--bf-cond-start:s2-->not-every<!--bf-cond-end:s2--></p>
      <p bf="s5"><!--bf:s4-->3<!--/--></p>
      <p bf="s7"><!--bf:s6-->2<!--/--></p>
      <p bf="s9"><!--bf:s8-->21<!--/--></p>
      <p bf="s11"><!--bf:s10-->2,5,6,8<!--/--></p>
      <p bf="s13"><!--bf:s12-->1,2,2.5,2,3,2,4,2<!--/--></p>
      <p bf="s15"><!--bf:s14-->4,3,2.5,1<!--/--></p>
      <p bf="s17"><!--bf:s16-->b,-,e<!--/--></p>
    </div>
  `,
})
