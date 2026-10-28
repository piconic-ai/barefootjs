import { createFixture } from '../src/types'

/**
 * Arithmetic over destructured bindings typed as a nullable number union:
 * `nothing: number | null` passed `null` reads as `0`, and an omitted
 * `gone?: number | undefined` reads as `undefined` (`NaN`). The union is
 * carried as `ParamInfo.declaredType` (a destructured binding's union type
 * does not resolve to `type`), so the shared coercion
 * (`arithmeticOperandCoercion`) classifies both as it does the `props.n`
 * form (`nullish-operand-arithmetic-matrix`,
 * `omitted-optional-number-arithmetic`). Before, neither was coerced: the
 * `null` operand failed the render on Jinja, MiniJinja, ERB and Pebble, and
 * the omitted one read as `0` elsewhere.
 */
export const fixture = createFixture({
  id: 'nullable-number-arithmetic-destructured',
  description: 'Arithmetic over destructured number | null and number | undefined props',
  source: `
export function NullableNumberArithmeticDestructured({ nothing, gone }: { nothing: number | null; gone?: number | undefined }) {
  return (
    <p data-nothing={nothing - 1} data-gone={gone * 2}>
      <span>{nothing * 3}</span>
      <span>{gone + 1}</span>
      <span>{-nothing}</span>
    </p>
  )
}
`,
  props: { nothing: null },
  expectedHtml: `
    <p bf-s="test" bf="s6" data-gone="NaN" data-nothing="-1">
      <span bf="s1"><!--bf:s0-->0<!--/--></span>
      <span bf="s3"><!--bf:s2-->NaN<!--/--></span>
      <span bf="s5"><!--bf:s4-->0<!--/--></span>
    </p>
  `,
})
