import { createFixture } from '../src/types'

/**
 * An omitted optional prop under a numeric or string coercion reads
 * `undefined` in every position the primitive plan runs (#3750, #3824
 * step 4): a `.filter()` predicate (relational, unary `+`, arithmetic), a
 * body destructure, an element-access read (`props['n']`), an attribute,
 * text, a JSX conditional, a memo and a child prop. `undefined` converts to `NaN`, so every comparison is false
 * and arithmetic is `NaN`; against a string it is `"undefined"`.
 */
export const fixture = createFixture({
  id: 'nil-reading-positions',
  description: 'An omitted optional prop reads undefined under a numeric or string coercion in every position',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

function Show(props: { label: string; value: number }) {
  return <b data-label={props.label}>{props.value}</b>
}

export function NilReadingPositions(props: { items: number[]; n?: number; s?: string }) {
  const { n: dn } = props
  const lt = createMemo(() => (props.n < 1))
  return (
    <div data-neg={-props.n} data-d={dn * 2} data-s={props.s + '!'}>
      <p>{props.items.filter(i => (i > props.n)).length}|{props.items.filter(i => (+props.n < i)).length}|{props.items.filter(i => ((i - props.n) > 0)).length}</p>
      <ol>{props.items.filter(i => (i > props.n)).map(i => <li key={i}>{i}</li>)}</ol>
      <span>{lt() ? 'T' : 'F'}|{dn * 2}|{props['n'] + 1}|{(props.s < 'b') ? 'T' : 'F'}|{\`\${dn}\`}</span>
      {(props.n < 1) ? <b>lt</b> : <i>not-lt</i>}
      <Show label="n" value={props.n * 2} />
    </div>
  )
}
`,
  props: { items: [1, 2] },
  expectedHtml: `
    <div bf-s="test" bf="s14" data-d="NaN" data-neg="NaN" data-s="undefined!">
      <p bf="s3"><!--bf:s0-->0<!--/-->|<!--bf:s1-->0<!--/-->|<!--bf:s2-->0<!--/--></p>
      <ol bf="s5"></ol>
      <span bf="s11"><!--bf-cond-start:s6-->F<!--bf-cond-end:s6-->|<!--bf:s7-->NaN<!--/-->|<!--bf:s8-->NaN<!--/-->|<!--bf-cond-start:s9-->F<!--bf-cond-end:s9-->|<!--bf:s10-->undefined<!--/--></span>
      <i bf-c="s12">not-lt</i>
      <b bf-s="test_s13" bf="s1" data-label="n"><!--bf:s0-->NaN<!--/--></b>
    </div>
  `,
})
