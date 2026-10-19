import { createFixture } from '../src/types'

/**
 * The destructured twin of `omitted-optional-number-arithmetic` (#3533): an
 * omitted `n?: number` binding reads as `undefined`, so `n * 2` and `n + 1`
 * are `NaN`, and a present `0` binding keeps its value.
 */
export const fixture = createFixture({
  id: 'omitted-optional-number-arithmetic-destructured',
  description: 'Arithmetic over an omitted destructured optional number prop (undefined → NaN)',
  source: `
export function OmittedOptionalNumberArithmeticDestructured({ n, zero }: { n?: number; zero?: number }) {
  return (
    <p data-n={n * 2} data-zero={zero - 1}>
      <span>{n + 1}</span>
      <span>{zero * 3}</span>
    </p>
  )
}
`,
  props: { zero: 0 },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-n="NaN" data-zero="-1">
      <span bf="s1"><!--bf:s0-->NaN<!--/--></span>
      <span bf="s3"><!--bf:s2-->0<!--/--></span>
    </p>
  `,
})
