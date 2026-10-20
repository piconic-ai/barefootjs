import { createFixture } from '../src/types'

/**
 * JS `/` over a zero divisor is IEEE division: `1 / 0` is `Infinity`,
 * `-1 / 0` is `-Infinity` and `0 / 0` is `NaN`. The divisor is an integer
 * prop, and the dividend a literal, a negated literal, the same prop and
 * a signal, in an attribute and in text. An engine whose integer `/`
 * raises on a zero divisor fails the render. The non-zero divisors are
 * `number-division-matrix`.
 */
export const fixture = createFixture({
  id: 'number-division-zero-divisor',
  description: 'Division by zero renders Infinity, -Infinity or NaN',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NumberDivisionZeroDivisor(props: { zero: number }) {
  const [one] = createSignal(1)
  return (
    <p data-quotient={one() / props.zero}>
      <span>{1 / props.zero}</span>
      <span>{-1 / props.zero}</span>
      <span>{props.zero / props.zero}</span>
    </p>
  )
}
`,
  props: { zero: 0 },
  expectedHtml: `
    <p bf-s="test" bf="s6" data-quotient="Infinity">
      <span bf="s1"><!--bf:s0-->Infinity<!--/--></span>
      <span bf="s3"><!--bf:s2-->-Infinity<!--/--></span>
      <span bf="s5"><!--bf:s4-->NaN<!--/--></span>
    </p>
  `,
})
