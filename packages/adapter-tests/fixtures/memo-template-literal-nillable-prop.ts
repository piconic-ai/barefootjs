import { createFixture } from '../src/types'

/**
 * Memos that build a string from a prop that is not a plain string: a
 * template literal and a `+` concatenation over an optional string prop a
 * sibling signal seeds with `??` (so it is nillable on backends that need a
 * nil to tell it apart), over a number prop, and over a number signal. Each
 * converts the value with JS's string conversion, and the memos are read in
 * an attribute, text, a ternary condition, `&&`, a child prop, a loop row and
 * another memo's concatenation.
 */
export const fixture = createFixture({
  id: 'memo-template-literal-nillable-prop',
  description: 'template-literal and `+` memos over a nillable string prop, a number prop and a number signal render JS string conversion',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

function Shown(props: { v?: unknown }) {
  return <i>{props.v}</i>
}

export function MemoTemplateLiteralNillableProp(props: { b?: string; count: number; n?: number }) {
  const [s] = createSignal(props.b ?? 'y')
  const [k] = createSignal(props.n ?? 7)
  const [a] = createSignal(1)
  const tag = createMemo(() => \`\${props.b}-x\`)
  const bang = createMemo(() => \`\${props.b ?? ''}!\`)
  const lines = createMemo(() => \`<\${props.b}> "\${props.count}"\`)
  const c = createMemo(() => 'c=' + props.count)
  const cn = createMemo(() => \`n=\${props.n}/\${props.count}\`)
  const am = createMemo(() => 'a=' + a())
  const plus = createMemo(() => props.b + '+' + props.n)
  const chain = createMemo(() => tag() + '/' + c())
  return (
    <div data-s={s()} data-k={k()} data-tag={tag()} data-bang={bang()} data-lines={lines()} data-c={c()} data-cn={cn()} data-am={am()} data-plus={plus()}>
      {tag()}
      <p>{lines()}</p>
      {tag() === 'B-x' ? <b>{am()}</b> : <u>{cn()}</u>}
      {c() && <em>{chain()}</em>}
      <Shown v={c()} />
      <ul>{['p', 'q'].map((r) => <li key={r} data-t={tag()}>{r + plus()}</li>)}</ul>
    </div>
  )
}
`,
  props: { b: 'B', count: 2, n: 3 },
  expectedHtml: `
    <div bf-s="test" bf="s15" data-am="a=1" data-bang="B!" data-c="c=2" data-cn="n=3/2" data-k="3" data-lines="&lt;B&gt; &quot;2&quot;" data-plus="B+3" data-s="B" data-tag="B-x">
      <!--bf:s0-->B-x<!--/-->
      <p bf="s2"><!--bf:s1-->&lt;B&gt; &quot;2&quot;<!--/--></p>
      <b bf-c="s3" bf="s5"><!--bf:s4-->a=1<!--/--></b>
      <em bf-c="s8" bf="s10"><!--bf:s9-->B-x/c=2<!--/--></em>
      <i bf-s="test_s11" bf="s1"><!--bf:s0-->c=2<!--/--></i>
      <ul bf="s14">
        <li bf="s13" data-key="p" data-t="B-x"><!--bf:s12-->pB+3<!--/--></li>
        <li bf="s13" data-key="q" data-t="B-x"><!--bf:s12-->qB+3<!--/--></li>
      </ul>
    </div>
  `,
  dataPoints: [
    { name: 'empty-zero', props: { b: '', count: 0, n: 0 } },
    { name: 'escapes-fraction', props: { b: 'a"b<c&\'d', count: 2.5, n: -0 } },
    { name: 'number-notation', props: { b: 'B', count: 1e21, n: 1e-7 } },
    { name: 'large-and-small', props: { b: '001', count: 0.1, n: 123456789012 } },
  ],
})
