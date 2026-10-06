import { createFixture } from '../src/types'

/**
 * Sibling of `number-division-text`: JavaScript `/` on integer and
 * fractional operands, rendered as text and in an attribute. A negative
 * non-integral quotient (`-7 / 4` → `-1.75`), an exactly divisible pair
 * that keeps JS's integer spelling (`8 / 4` → `2`), a zero numerator
 * (`0 / 4` → `0`), fractional operands (`1.5 / 0.5` → `3`,
 * `7 / 2.5` → `2.8`), and a signal operand.
 */
export const fixture = createFixture({
  id: 'number-division-matrix',
  description: 'Integer and fractional division renders the JavaScript quotient',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NumberDivisionMatrix(props: { neg: number; even: number; zero: number; half: number }) {
  const [count] = createSignal(7)
  return (
    <ul data-ratio={props.neg / 4}>
      <li>{props.neg / 4}</li>
      <li>{props.even / 4}</li>
      <li>{props.zero / 4}</li>
      <li>{props.half / 0.5}</li>
      <li>{count() / 2.5}</li>
      <li>{count() / 2}</li>
    </ul>
  )
}
`,
  props: { neg: -7, even: 8, zero: 0, half: 1.5 },
  expectedHtml: `
    <ul bf-s="test" bf="s6" data-ratio="-1.75"><li><!--bf:s0-->-1.75<!--/--></li><li><!--bf:s1-->2<!--/--></li><li><!--bf:s2-->0<!--/--></li><li><!--bf:s3-->3<!--/--></li><li><!--bf:s4-->2.8<!--/--></li><li><!--bf:s5-->3.5<!--/--></li></ul>
  `,
})
