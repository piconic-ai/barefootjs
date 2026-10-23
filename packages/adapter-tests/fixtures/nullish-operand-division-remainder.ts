import { createFixture } from '../src/types'

/**
 * `/` and `%` over a `null` operand, which JS reads as `0` (#3474): a
 * signal seeded with `null` and a `number | null` prop passed as `null`,
 * as the dividend and as the divisor, in an attribute and in text. So
 * `null / 2` and `null % 2` are `0`, `2 / null` is `Infinity` and
 * `2 % null` is `NaN`. Both operators go through the runtime's `div` and
 * `mod` (`arithmeticHelper`), which take the nil as it is where the
 * adapter leaves the `null` coercion to the engine. `+ - * /` over a
 * `null` dividend are `nullish-operand-arithmetic-matrix`.
 */
export const fixture = createFixture({
  id: 'nullish-operand-division-remainder',
  description: 'Division and remainder over null operands, as dividend and divisor',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NullishOperandDivisionRemainder(props: { nothing: number | null }) {
  const [n] = createSignal<number | null>(null)
  return (
    <p data-quotient={n() / 2} data-remainder={props.nothing % 2}>
      <span>{2 / n()}</span>
      <span>{n() % 2}</span>
      <span>{2 / props.nothing}</span>
      <span>{2 % props.nothing}</span>
    </p>
  )
}
`,
  props: { nothing: null },
  expectedHtml: `
    <p bf-s="test" bf="s8" data-quotient="0" data-remainder="0">
      <span bf="s1"><!--bf:s0-->Infinity<!--/--></span>
      <span bf="s3"><!--bf:s2-->0<!--/--></span>
      <span bf="s5"><!--bf:s4-->Infinity<!--/--></span>
      <span bf="s7"><!--bf:s6-->NaN<!--/--></span>
    </p>
  `,
})
