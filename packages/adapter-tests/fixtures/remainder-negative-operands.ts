import { createFixture } from '../src/types'

/**
 * `%` with a negative dividend or divisor, from props and from signals, in
 * an attribute, in text, in a ternary condition and in a `.filter()`
 * predicate. JS `%` truncates toward zero, so the result takes the sign of
 * the dividend: `-7 % 2` is `-1`, `7 % -2` is `1`, `-7 % -2` is `-1`. A
 * floored remainder (Ruby, Python, Perl) takes the divisor's sign instead,
 * and a Euclidean one (MiniJinja) is never negative. Every DSL adapter
 * lowers `%` to the runtime's `mod` helper (`arithmeticHelper`).
 */
export const fixture = createFixture({
  id: 'remainder-negative-operands',
  description: 'Remainder with negative operands takes the dividend sign (-7 % 2 → -1)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function RemainderNegativeOperands(props: { a: number; b: number }) {
  const [x] = createSignal(-7)
  const [y] = createSignal(-2)
  const [xs] = createSignal([-3, -2, -1, 0, 1, 2, 3])
  return (
    <div data-props={props.a % 2} data-signals={x() % y()} class={x() % 2 === -1 ? 'negative' : 'other'}>
      <span>{props.a % 2}</span>
      <span>{7 % props.b}</span>
      <span>{props.a % props.b}</span>
      <span>{x() % 2}</span>
      <span>{7 % y()}</span>
      <span>{x() % y()}</span>
      <ul>
        {xs().filter(v => v % 2 === -1).map(v => (
          <li key={v}>{v}</li>
        ))}
      </ul>
    </div>
  )
}
`,
  props: { a: -7, b: -2 },
  expectedHtml: `
    <div bf-s="test" bf="s14" class="negative" data-props="-1" data-signals="-1">
      <span bf="s1"><!--bf:s0-->-1<!--/--></span>
      <span bf="s3"><!--bf:s2-->1<!--/--></span>
      <span bf="s5"><!--bf:s4-->-1<!--/--></span>
      <span bf="s7"><!--bf:s6-->-1<!--/--></span>
      <span bf="s9"><!--bf:s8-->1<!--/--></span>
      <span bf="s11"><!--bf:s10-->-1<!--/--></span>
      <ul bf="s13">
        <li data-key="-3"><!--bf:s12-->-3<!--/--></li>
        <li data-key="-1"><!--bf:s12-->-1<!--/--></li>
      </ul>
    </div>
  `,
})
