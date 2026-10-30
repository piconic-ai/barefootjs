import { createFixture } from '../src/types'

/**
 * A callback predicate that reads `props.X` through the props object
 * (`function C(props)`). Template backends have no `props` object — a prop is
 * the top-level variable `X` — so the evaluator env must bind each `props.X`
 * read, not `props` itself. Covers a memo read in attribute, text, ternary,
 * `&&`, child-prop, loop and template-literal positions, a direct
 * `.filter().length`, a callback param named like the prop (`n => n >
 * props.n`), a string prop, and a loop row whose param shadows the prop name.
 * The destructured twin is `memo-filter-prop-capture-destructured`.
 */
export const fixture = createFixture({
  id: 'memo-filter-prop-capture',
  description: '.filter() predicate capturing props.X through the props object, in a memo and inline',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

function Count(props: { value: number }) {
  return <b>{props.value}</b>
}

export function MemoFilterPropCapture(props: { items: number[]; n: number; label: string; tags: string[] }) {
  const big = createMemo(() => props.items.filter((i) => i > props.n))
  const above = createMemo(() => props.items.filter((n) => n > props.n))
  const others = createMemo(() => props.tags.filter((t) => t !== props.label))
  return (
    <div data-count={big().length} title={\`\${props.label}:\${big().join(',')}\`}>
      <p>{big().join(',')}</p>
      <p>{big().length > 1 ? 'many' : 'few'}</p>
      {big().length > 0 && <span>has</span>}
      <Count value={big().length} />
      <i>{props.items.filter((i) => i > props.n).length}</i>
      <em>{above().join(',')}</em>
      <s>{others().join(',')}</s>
      <ul>{big().map((i) => <li key={i}>{i}</li>)}</ul>
      <ol>{props.items.map((n) => <li key={n}>{props.items.filter((i) => i > props.n && i !== n).length}</li>)}</ol>
    </div>
  )
}
`,
  props: { items: [1, 2.5, 3, 4], n: 2.5, label: 'b', tags: ['a', 'b', 'c'] },
  expectedHtml: `
    <div bf-s="test" bf="s17" data-count="2" title="b:3,4">
      <p bf="s1"><!--bf:s0-->3,4<!--/--></p>
      <p bf="s3"><!--bf-cond-start:s2-->many<!--bf-cond-end:s2--></p>
      <span bf-c="s4">has</span>
      <b bf-s="test_s5" bf="s1"><!--bf:s0-->2<!--/--></b>
      <i bf="s7"><!--bf:s6-->2<!--/--></i>
      <em bf="s9"><!--bf:s8-->3,4<!--/--></em>
      <s bf="s11"><!--bf:s10-->a,c<!--/--></s>
      <ul bf="s13">
        <li data-key="3"><!--bf:s12-->3<!--/--></li>
        <li data-key="4"><!--bf:s12-->4<!--/--></li>
      </ul>
      <ol bf="s16">
        <li bf="s15" data-key="1"><!--bf:s14-->2<!--/--></li>
        <li bf="s15" data-key="2.5"><!--bf:s14-->2<!--/--></li>
        <li bf="s15" data-key="3"><!--bf:s14-->1<!--/--></li>
        <li bf="s15" data-key="4"><!--bf:s14-->1<!--/--></li>
      </ol>
    </div>
  `,
})
