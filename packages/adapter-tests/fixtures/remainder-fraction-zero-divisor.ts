import { createFixture } from '../src/types'

/**
 * `%` over a fraction and over a zero divisor, in an attribute and in
 * text. The fractions come from signals and the zero divisor from a prop.
 * JS `%` is the floating-point remainder: `7.5 % 2` is `1.5`, `-7.5 % 2`
 * is `-1.5`, and `7 % 0` is `NaN`. An engine whose `%` is an integer
 * operation truncates the fraction first, and one whose integer `%` raises
 * on a zero divisor fails the render. The `NaN` dividend is
 * `remainder-nan-operand`; the negative operands are
 * `remainder-negative-operands`.
 */
export const fixture = createFixture({
  id: 'remainder-fraction-zero-divisor',
  description: 'Remainder over a fraction and a zero divisor (7.5 % 2 → 1.5, 7 % 0 → NaN)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function RemainderFractionZeroDivisor(props: { zero: number }) {
  const [f] = createSignal(7.5)
  const [w] = createSignal(-7.5)
  return (
    <p data-fraction={f() % 2} data-zero={7 % props.zero}>
      <span>{f() % 2}</span>
      <span>{w() % 2}</span>
      <span>{w() % props.zero}</span>
    </p>
  )
}
`,
  props: { zero: 0 },
  expectedHtml: `
    <p bf-s="test" bf="s6" data-fraction="1.5" data-zero="NaN">
      <span bf="s1"><!--bf:s0-->1.5<!--/--></span>
      <span bf="s3"><!--bf:s2-->-1.5<!--/--></span>
      <span bf="s5"><!--bf:s4-->NaN<!--/--></span>
    </p>
  `,
})
