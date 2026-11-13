import { createFixture } from '../src/types'

/**
 * A number-returning builtin call (`Math.*`, `Number(x)`) printed in every
 * output position: text, attribute, a memo, a memo of a memo, a loop row and
 * a concatenation. The fractional results are where a backend that prints a
 * number with its own stringification diverges from JS: Perl's `%.15g`
 * drops digits (`0.30000000000000004` → `0.3`), and a perl built with
 * `-Duselongdouble` adds them (`7.6` → `7.59999999999999964`, #3872).
 * The `-0` results (`Math.ceil(-0.4)`, `Math.round(-0.4)`) print as `0`.
 */
export const fixture = createFixture({
  id: 'math-number-output',
  description: 'Math.* and Number() results print as JS numbers in text, attributes, memos, loop rows and concatenation',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function MathNumberOutput() {
  const [n, setN] = createSignal(-7.6)
  const [a, setA] = createSignal(0.1)
  const [z, setZ] = createSignal(-0.4)
  const [s, setS] = createSignal('0.30000000000000004')
  const [rows, setRows] = createSignal([-7.6, 2.5])
  const absN = createMemo(() => Math.abs(n()))
  const sameAbs = createMemo(() => absN())
  return (
    <div data-abs={Math.abs(n())} data-sum={Math.max(a() + 0.2, 0)} data-num={Number(s())}>
      <span>{Math.abs(n())}</span>
      <span>{Math.min(n(), 10)}</span>
      <span>{Math.max(a() + 0.2, 0)}</span>
      <span>{Number(s())}</span>
      <span>{Math.ceil(z())}</span>
      <span>{Math.round(z())}</span>
      <span>{absN()}</span>
      <span>{sameAbs()}</span>
      <span>{'v' + Math.abs(n())}</span>
      <span>{\`t\${Math.max(a() + 0.2, 0)}\`}</span>
      <ul>{rows().map(r => <li key={r}>{Math.abs(r)}</li>)}</ul>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s22" data-abs="7.6" data-num="0.30000000000000004" data-sum="0.30000000000000004">
      <span bf="s1"><!--bf:s0-->7.6<!--/--></span>
      <span bf="s3"><!--bf:s2-->-7.6<!--/--></span>
      <span bf="s5"><!--bf:s4-->0.30000000000000004<!--/--></span>
      <span bf="s7"><!--bf:s6-->0.30000000000000004<!--/--></span>
      <span bf="s9"><!--bf:s8-->0<!--/--></span>
      <span bf="s11"><!--bf:s10-->0<!--/--></span>
      <span bf="s13"><!--bf:s12-->7.6<!--/--></span>
      <span bf="s15"><!--bf:s14-->7.6<!--/--></span>
      <span bf="s17"><!--bf:s16-->v7.6<!--/--></span>
      <span bf="s19"><!--bf:s18-->t0.30000000000000004<!--/--></span>
      <ul bf="s21">
        <li data-key="-7.6"><!--bf:s20-->7.6<!--/--></li>
        <li data-key="2.5"><!--bf:s20-->2.5<!--/--></li>
      </ul>
    </div>
  `,
})
