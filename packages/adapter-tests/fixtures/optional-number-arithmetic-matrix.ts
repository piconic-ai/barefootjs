import { createFixture } from '../src/types'

/**
 * Arithmetic over optional number props, beside the omitted case in
 * `omitted-optional-number-arithmetic` (#3533): an omitted prop under `-`,
 * `/` and against another prop reads as `undefined` and gives `NaN`, while
 * a present `0` or `5` keeps its value and a `number | null` prop passed
 * `null` reads as `0`. The coercion that turns the omitted prop into `NaN`
 * must not touch a present value or a `null`.
 */
export const fixture = createFixture({
  id: 'optional-number-arithmetic-matrix',
  description: 'Arithmetic over omitted, present-zero, present and null number props',
  source: `
export function OptionalNumberArithmeticMatrix(props: { missing?: number; zero?: number; five?: number; nothing: number | null }) {
  return (
    <p data-minus={props.missing - 1} data-div={props.missing / 2} data-zero={props.zero * 2}>
      <span>{props.missing * props.five}</span>
      <span>{props.zero + 1}</span>
      <span>{props.five * 2}</span>
      <span>{props.nothing * 2}</span>
    </p>
  )
}
`,
  props: { zero: 0, five: 5, nothing: null },
  expectedHtml: `
    <p bf-s="test" bf="s8" data-div="NaN" data-minus="NaN" data-zero="0">
      <span bf="s1"><!--bf:s0-->NaN<!--/--></span>
      <span bf="s3"><!--bf:s2-->1<!--/--></span>
      <span bf="s5"><!--bf:s4-->10<!--/--></span>
      <span bf="s7"><!--bf:s6-->0<!--/--></span>
    </p>
  `,
})
