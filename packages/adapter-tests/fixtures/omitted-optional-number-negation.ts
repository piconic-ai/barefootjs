import { createFixture } from '../src/types'

/**
 * Unary minus over number props (#3533). JS applies `ToNumber` as binary `-`
 * does: an omitted optional prop reads as `undefined`, so `-missing` is
 * `NaN`; a present `0` and a `null` negate to `-0`, which renders `0`.
 */
export const fixture = createFixture({
  id: 'omitted-optional-number-negation',
  description: 'Unary minus over an omitted optional number prop (-undefined → NaN)',
  source: `
export function OmittedOptionalNumberNegation(props: { missing?: number; zero?: number; nothing: number | null }) {
  return (
    <p data-missing={-props.missing}>
      <span>{-props.zero}</span>
      <span>{-props.nothing}</span>
    </p>
  )
}
`,
  props: { zero: 0, nothing: null },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-missing="NaN">
      <span bf="s1"><!--bf:s0-->0<!--/--></span>
      <span bf="s3"><!--bf:s2-->0<!--/--></span>
    </p>
  `,
})
