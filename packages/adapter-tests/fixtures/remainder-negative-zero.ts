import { createFixture } from '../src/types'

/**
 * `%` whose dividend is negative and whose remainder is zero: JS gives
 * negative zero (`-4 % 2` is `-0`). `String(-0)` is `"0"`, `-0 === 0`
 * holds, and `items[-0]` is `items[0]`, so the remainder renders as zero
 * from a prop and from a signal, and compares and indexes as zero from a
 * signal (the index stays off the prop, whose generated negative odd
 * values would index at `-1`). The sign shows only
 * through later arithmetic: `1 / (v % 2)` in a `.map()` callback, which a
 * backend computes with its expression evaluator, is `-Infinity` for
 * `v = -4`; an integer remainder (`0`) loses the sign and gives
 * `Infinity`. The same quotient in a template expression is
 * `remainder-negative-zero-quotient`; the other signs are
 * `remainder-negative-operands`.
 */
export const fixture = createFixture({
  id: 'remainder-negative-zero',
  description: 'Remainder of a negative dividend that divides evenly is -0 (renders 0, 1 / (-4 % 2) → -Infinity)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function RemainderNegativeZero(props: { n: number }) {
  const [x] = createSignal(-4)
  const [labels] = createSignal(['even', 'odd'])
  const [xs] = createSignal([-4, 4])
  return (
    <p data-zero={props.n % 2} class={x() % 2 === 0 ? 'zero' : 'other'}>
      <span>{props.n % 2}</span>
      <span>{x() % 2}</span>
      <span>{labels()[x() % 2]}</span>
      <span>{xs().map(v => v % 2).join(',')}</span>
      <span>{xs().map(v => 1 / (v % 2)).join(',')}</span>
    </p>
  )
}
`,
  props: { n: -4 },
  expectedHtml: `
    <p bf-s="test" bf="s10" class="zero" data-zero="0">
      <span bf="s1"><!--bf:s0-->0<!--/--></span>
      <span bf="s3"><!--bf:s2-->0<!--/--></span>
      <span bf="s5"><!--bf:s4-->even<!--/--></span>
      <span bf="s7"><!--bf:s6-->0,0<!--/--></span>
      <span bf="s9"><!--bf:s8-->-Infinity,Infinity<!--/--></span>
    </p>
  `,
})
