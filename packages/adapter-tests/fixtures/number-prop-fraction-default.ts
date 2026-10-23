import { createFixture } from '../src/types'

/**
 * A destructured `number` prop with an integer default (`n = 2`), given a
 * fraction. The default only applies to an absent prop, so the caller's
 * `1.5` is read as is, in text, in an attribute, and under `*`. An engine
 * that types the prop from the integral default truncates it.
 */
export const fixture = createFixture({
  id: 'number-prop-fraction-default',
  description: 'A fractional number prop with an integer destructure default keeps its fraction (1.5, 4.5)',
  source: `
export function NumberPropFractionDefault({ n = 2 }: { n?: number }) {
  return (
    <p data-n={n}>
      <span>{n}</span>
      <span>{n * 3}</span>
    </p>
  )
}
`,
  props: { n: 1.5 },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-n="1.5">
      <span bf="s1"><!--bf:s0-->1.5<!--/--></span>
      <span bf="s3"><!--bf:s2-->4.5<!--/--></span>
    </p>
  `,
})
