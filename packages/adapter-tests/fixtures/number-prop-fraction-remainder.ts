import { createFixture } from '../src/types'

/**
 * A `number` prop whose only arithmetic is `%`, given a fraction. JS `%`
 * is the floating-point remainder, so `7.5 % 2` is `1.5`. An engine that
 * types the prop from the operator as an integer cannot take `7.5` at
 * all, or truncates it to `7` first (`1`). `remainder-fraction-zero-divisor`
 * covers fractions that come from signals.
 */
export const fixture = createFixture({
  id: 'number-prop-fraction-remainder',
  description: 'A fractional number prop used only under `%` keeps its fraction (7.5 % 2 → 1.5)',
  source: `
export function NumberPropFractionRemainder(props: { n: number }) {
  return (
    <p data-r={props.n % 2}>
      <span>{props.n % 2}</span>
      <span>{props.n}</span>
    </p>
  )
}
`,
  props: { n: 7.5 },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-r="1.5">
      <span bf="s1"><!--bf:s0-->1.5<!--/--></span>
      <span bf="s3"><!--bf:s2-->7.5<!--/--></span>
    </p>
  `,
})
