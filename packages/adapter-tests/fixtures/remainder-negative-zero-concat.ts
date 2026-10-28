import { createFixture } from '../src/types'

/**
 * The `-0` of `remainder-negative-zero` joined to a string with `+`:
 * `-4 % 2` is `-0`, and `'r=' + -0` is `"r=0"`. Both operand orders, from
 * a prop and from a signal, in an attribute and in text, through a memo,
 * `Math.abs`, and a loop row. A backend that keeps the float `-0.0` and
 * concatenates with the host's own number spelling renders `r=-0`. The
 * other string conversions are `remainder-negative-zero-string`.
 */
export const fixture = createFixture({
  id: 'remainder-negative-zero-concat',
  description: 'A string joined with the -0 remainder of a negative dividend spells it "0" (\'r=\' + (-4 % 2))',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function RemainderNegativeZeroConcat(props: { n: number }) {
  const [x] = createSignal(-4)
  const [xs] = createSignal([-4, 4])
  const r = createMemo(() => x() % 2)
  return (
    <p data-concat={'r=' + (x() % 2)} data-rev={(props.n % 2) + '=r'}>
      <span>{'r=' + (props.n % 2)}</span>
      <span>{(props.n % 2) + '=r'}</span>
      <span>{'r=' + (x() % 2)}</span>
      <span>{(x() % 2) + '=r'}</span>
      <span>{'a=' + Math.abs(x() % 2)}</span>
      <span>{'m=' + r()}</span>
      <ul>{xs().map(v => <li key={v}>{'v=' + (v % 2)}</li>)}</ul>
    </p>
  )
}
`,
  props: { n: -4 },
  expectedHtml: `
    <p bf-s="test" bf="s14" data-concat="r=0" data-rev="0=r">
      <span bf="s1"><!--bf:s0-->r=0<!--/--></span>
      <span bf="s3"><!--bf:s2-->0=r<!--/--></span>
      <span bf="s5"><!--bf:s4-->r=0<!--/--></span>
      <span bf="s7"><!--bf:s6-->0=r<!--/--></span>
      <span bf="s9"><!--bf:s8-->a=0<!--/--></span>
      <span bf="s11"><!--bf:s10-->m=0<!--/--></span>
      <ul bf="s13">
        <li data-key="-4"><!--bf:s12-->v=0<!--/--></li>
        <li data-key="4"><!--bf:s12-->v=0<!--/--></li>
      </ul>
    </p>
  `,
})
