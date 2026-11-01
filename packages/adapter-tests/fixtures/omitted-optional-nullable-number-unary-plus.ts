import { createFixture } from '../src/types'

/**
 * The unary-plus twin of `omitted-optional-nullable-number-arithmetic`
 * (#3824 step 3). Unary plus applies ToNumber, so an omitted prop is
 * `undefined` (`NaN`) and a `null` one is `0`. A prop typed
 * `missing?: number | null` can be either, a template engine holds both as
 * one nil, and the type does not say which, so every template adapter
 * refuses the operand with BF101 (`arithmeticOperandNilIsAmbiguous`).
 * Declaring only one of the two is the rewrite:
 * `omitted-optional-number-unary-plus`.
 */
export const fixture = createFixture({
  id: 'omitted-optional-nullable-number-unary-plus',
  description: 'Unary plus over an omitted optional prop typed number | null (+undefined → NaN)',
  source: `
export function OmittedOptionalNullableNumberUnaryPlus(props: { missing?: number | null }) {
  return (
    <p data-plus={+props.missing}>
      <span>{+props.missing < 1 ? 'T' : 'F'}</span>
    </p>
  )
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s2" data-plus="NaN"><span bf="s1"><!--bf-cond-start:s0-->F<!--bf-cond-end:s0--></span></p>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'omitted-optional-number-unary-plus' }],
})
