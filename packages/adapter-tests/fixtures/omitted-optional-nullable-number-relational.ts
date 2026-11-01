import { createFixture } from '../src/types'

/**
 * The relational twin of `omitted-optional-nullable-number-arithmetic`
 * (#3824 step 3). A relational operator applies ToNumber to a non-string
 * operand, so it reads a nil as arithmetic does: an omitted prop is
 * `undefined` (`NaN`, so `missing < 1` is false) and a `null` one is `0`
 * (`missing < 1` is true). A prop typed `missing?: number | null` can be
 * either, a template engine holds both as one nil, and the type does not
 * say which, so every template adapter refuses the comparison with BF101
 * (`arithmeticOperandNilIsAmbiguous`) instead of rendering one reading.
 * Declaring only one of the two is the rewrite:
 * `omitted-optional-number-relational`.
 */
export const fixture = createFixture({
  id: 'omitted-optional-nullable-number-relational',
  description: 'A comparison over an omitted optional prop typed number | null (undefined → NaN → false)',
  source: `
export function OmittedOptionalNullableNumberRelational(props: { missing?: number | null }) {
  return (
    <p data-lt={props.missing < 1 ? 'T' : 'F'}>
      <span>{props.missing >= 1 ? 'T' : 'F'}</span>
    </p>
  )
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s2" data-lt="F"><span bf="s1"><!--bf-cond-start:s0-->F<!--bf-cond-end:s0--></span></p>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'omitted-optional-number-relational' }],
})
