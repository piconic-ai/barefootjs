import { createFixture } from '../src/types'

/**
 * Sibling of `memo-dependency-loop-shadow` (#3369): `.map()` params named
 * like the component's memos — the item param, the index param, an inner
 * nested loop's param, and an empty loop's param — shadow the memo only
 * inside their row, and the memo still renders its own value before and
 * after the loops.
 */
export const fixture = createFixture({
  id: 'memo-loop-param-collision',
  description: 'Loop params named like memos shadow them only inside the row, with memo reads before and after the loops',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function MemoLoopParamCollision(props: { rows: string[]; groups: string[][]; none: string[] }) {
  const [s] = createSignal('outer')
  const [n] = createSignal(5)
  const label = createMemo(() => s())
  const i = createMemo(() => n() * 2)
  return (
    <div>
      <p className="before">{label()}</p>
      <ul>{props.rows.map((label, i) => <li key={label} title={label}>{label}-{i}</li>)}</ul>
      <ol>{props.groups.map(g => <li key={g.join()}>{g.map(label => <span key={label} title={label}>{label}</span>)}</li>)}</ol>
      <dl>{props.none.map(label => <dt key={label}>{label}</dt>)}</dl>
      <p className="after" data-i={i()}>{label()}</p>
    </div>
  )
}
`,
  props: { rows: ['x', 'y'], groups: [['a', 'b']], none: [] },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1" class="before"><!--bf:s0-->outer<!--/--></p>
      <ul bf="s5">
        <li bf="s4" data-key="x" title="x"><!--bf:s2-->x<!--/-->-<!--bf:s3-->0<!--/--></li>
        <li bf="s4" data-key="y" title="y"><!--bf:s2-->y<!--/-->-<!--bf:s3-->1<!--/--></li>
      </ul>
      <ol bf="s9"><li bf="s8" data-key="a,b"><span bf="s7" data-key-1="a" title="a"><!--bf:s6-->a<!--/--></span><span bf="s7" data-key-1="b" title="b"><!--bf:s6-->b<!--/--></span></li></ol>
      <dl bf="s11"></dl>
      <p bf="s13" class="after" data-i="10"><!--bf:s12-->outer<!--/--></p>
    </div>
  `,
})
