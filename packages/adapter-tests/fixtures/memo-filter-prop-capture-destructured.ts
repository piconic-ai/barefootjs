import { createFixture } from '../src/types'

/**
 * The destructured-props twin of `memo-filter-prop-capture`: the predicate
 * captures the bare prop `n` / `label`, and the memo's receiver is the bare
 * prop `items` rather than `props.items`.
 */
export const fixture = createFixture({
  id: 'memo-filter-prop-capture-destructured',
  description: '.filter() predicate capturing a destructured prop, in a memo and inline',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

function Count(props: { value: number }) {
  return <b>{props.value}</b>
}

export function MemoFilterPropCaptureDestructured({ items, n, label, tags }: { items: number[]; n: number; label: string; tags: string[] }) {
  const big = createMemo(() => items.filter((i) => i > n))
  const others = createMemo(() => tags.filter((t) => t !== label))
  return (
    <div data-count={big().length} title={\`\${label}:\${big().join(',')}\`}>
      <p>{big().join(',')}</p>
      <p>{big().length > 1 ? 'many' : 'few'}</p>
      {big().length > 0 && <span>has</span>}
      <Count value={big().length} />
      <i>{items.filter((i) => i > n).length}</i>
      <s>{others().join(',')}</s>
      <ul>{big().map((i) => <li key={i}>{i}</li>)}</ul>
      <ol>{items.map((j) => <li key={j}>{items.filter((i) => i > n && i !== j).length}</li>)}</ol>
    </div>
  )
}
`,
  props: { items: [1, 2.5, 3, 4], n: 2.5, label: 'b', tags: ['a', 'b', 'c'] },
  expectedHtml: `
    <div bf-s="test" bf="s15" data-count="2" title="b:3,4">
      <p bf="s1"><!--bf:s0-->3,4<!--/--></p>
      <p bf="s3"><!--bf-cond-start:s2-->many<!--bf-cond-end:s2--></p>
      <span bf-c="s4">has</span>
      <b bf-s="test_s5" bf="s1"><!--bf:s0-->2<!--/--></b>
      <i bf="s7"><!--bf:s6-->2<!--/--></i>
      <s bf="s9"><!--bf:s8-->a,c<!--/--></s>
      <ul bf="s11">
        <li data-key="3"><!--bf:s10-->3<!--/--></li>
        <li data-key="4"><!--bf:s10-->4<!--/--></li>
      </ul>
      <ol bf="s14">
        <li bf="s13" data-key="1"><!--bf:s12-->2<!--/--></li>
        <li bf="s13" data-key="2.5"><!--bf:s12-->2<!--/--></li>
        <li bf="s13" data-key="3"><!--bf:s12-->1<!--/--></li>
        <li bf="s13" data-key="4"><!--bf:s12-->1<!--/--></li>
      </ol>
    </div>
  `,
})
