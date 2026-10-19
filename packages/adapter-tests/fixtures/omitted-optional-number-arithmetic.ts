import { createFixture } from '../src/types'

/**
 * Arithmetic over an optional number prop the caller omits (#3474, #3533).
 * JS reads the omitted prop as `undefined`, so `missing * 2` is `NaN`. A
 * template engine holds an omitted prop and a `null` one as the same nil,
 * so the prop's type decides what the nil stands for: `missing?: number`
 * cannot be `null`, so every DSL adapter reads its nil as `undefined`
 * (`arithmeticOperandCoercion`). Siblings: `optional-number-arithmetic-matrix`
 * (other operators, a present `0`, a `null`) and
 * `omitted-optional-number-arithmetic-destructured`.
 */
export const fixture = createFixture({
  id: 'omitted-optional-number-arithmetic',
  description: 'Arithmetic over an omitted optional number prop (undefined → NaN)',
  source: `
export function OmittedOptionalNumberArithmetic(props: { missing?: number }) {
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
})
