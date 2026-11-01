import { createFixture } from '../src/types'

/**
 * Unary plus over number props (#3824 step 3). JS applies `ToNumber` as unary
 * minus does: an omitted optional prop reads as `undefined`, so
 * `+missing` is `NaN` and every comparison over it is false; a `null` reads
 * as `0`. Positions: an attribute value, an attribute ternary, a text
 * ternary and a text value. The rewrite of
 * `omitted-optional-nullable-number-unary-plus`.
 */
export const fixture = createFixture({
  id: 'omitted-optional-number-unary-plus',
  description: 'Unary plus over an omitted optional number prop (+undefined → NaN)',
  source: `
export function OmittedOptionalNumberUnaryPlus(props: { missing?: number; nothing: number | null }) {
  return (
    <p data-plus={+props.missing} data-lt={+props.missing < 1 ? 'T' : 'F'}>
      <span>{+props.missing <= 0 ? 'T' : 'F'}</span>
      <span>{+props.nothing}</span>
    </p>
  )
}
`,
  props: { nothing: null },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-lt="F" data-plus="NaN">
      <span bf="s1"><!--bf-cond-start:s0-->F<!--bf-cond-end:s0--></span>
      <span bf="s3"><!--bf:s2-->0<!--/--></span>
    </p>
  `,
})
