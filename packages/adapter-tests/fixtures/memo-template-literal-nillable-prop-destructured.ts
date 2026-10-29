import { createFixture } from '../src/types'

/**
 * The destructured-props twin of `memo-template-literal-nillable-prop`:
 * template-literal and `+` memos over an optional string prop a sibling
 * signal seeds with `??`, over a number prop, and over a number signal,
 * read in an attribute, text, a ternary condition, `&&`, a child prop and a
 * loop row whose parameter shadows the string prop.
 */
export const fixture = createFixture({
  id: 'memo-template-literal-nillable-prop-destructured',
  description: 'template-literal and `+` memos over destructured nillable string and number props render JS string conversion',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

function Shown(props: { v?: unknown }) {
  return <i>{props.v}</i>
}

export function MemoTemplateLiteralNillablePropDestructured({ b, count, n }: { b?: string; count: number; n?: number }) {
  const [s] = createSignal(b ?? 'y')
  const [k] = createSignal(n ?? 7)
  const [a] = createSignal(1)
  const tag = createMemo(() => \`\${b}-x\`)
  const c = createMemo(() => 'c=' + count)
  const cn = createMemo(() => \`n=\${n}/\${count}\`)
  const am = createMemo(() => 'a=' + a())
  const plus = createMemo(() => b + '+' + n)
  return (
    <div data-s={s()} data-k={k()} data-tag={tag()} data-c={c()} data-cn={cn()} data-am={am()}>
      {tag()}
      {tag() === 'B-x' ? <b>{am()}</b> : <u>{cn()}</u>}
      {c() && <em>{plus()}</em>}
      <Shown v={tag()} />
      <ul>{['p', 'q'].map((b) => <li key={b}>{b + c()}</li>)}</ul>
    </div>
  )
}
`,
  props: { b: 'B', count: 2, n: 3 },
  expectedHtml: `
    <div bf-s="test" bf="s13" data-am="a=1" data-c="c=2" data-cn="n=3/2" data-k="3" data-s="B" data-tag="B-x">
      <!--bf:s0-->B-x<!--/-->
      <b bf-c="s1" bf="s3"><!--bf:s2-->a=1<!--/--></b>
      <em bf-c="s6" bf="s8"><!--bf:s7-->B+3<!--/--></em>
      <i bf-s="test_s9" bf="s1"><!--bf:s0-->B-x<!--/--></i>
      <ul bf="s12">
        <li bf="s11" data-key="p"><!--bf:s10-->pc=2<!--/--></li>
        <li bf="s11" data-key="q"><!--bf:s10-->qc=2<!--/--></li>
      </ul>
    </div>
  `,
  dataPoints: [
    { name: 'empty-zero', props: { b: '', count: 0, n: 0 } },
    { name: 'escapes-fraction', props: { b: 'a"b<c&\'d', count: 2.5, n: -0 } },
    { name: 'number-notation', props: { b: 'B', count: 1e21, n: 1e-7 } },
  ],
})
