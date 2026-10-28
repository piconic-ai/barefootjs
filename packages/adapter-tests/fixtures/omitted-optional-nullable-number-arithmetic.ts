import { createFixture } from '../src/types'

/**
 * Arithmetic over an omitted optional prop whose type also admits `null`
 * (`missing?: number | null`). JS reads the omitted prop as `undefined`, so
 * `missing * 2` is `NaN`, where a `null` one would give `0`. A template
 * engine holds both as the same nil, and the type does not say which one it
 * stands for, so every template adapter refuses the arithmetic with BF101
 * (`arithmeticOperandNilIsAmbiguous`) instead of rendering one reading.
 * Declaring only one of the two (`missing?: number`) is the rewrite: that
 * is `omitted-optional-number-arithmetic`. The destructured form is
 * `omitted-optional-nullable-number-arithmetic-destructured`.
 */
export const fixture = createFixture({
  id: 'omitted-optional-nullable-number-arithmetic',
  description: 'Arithmetic over an omitted optional prop typed number | null (undefined → NaN)',
  source: `
export function OmittedOptionalNullableNumberArithmetic(props: { missing?: number | null }) {
  return (
    <p data-missing={props.missing * 2}>
      <span>{props.missing + 1}</span>
    </p>
  )
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s2" data-missing="NaN"><span bf="s1"><!--bf:s0-->NaN<!--/--></span></p>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'omitted-optional-number-arithmetic' }],
})
