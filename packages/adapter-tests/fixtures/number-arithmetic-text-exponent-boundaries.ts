import { createFixture } from '../src/types'

/**
 * Text-position sibling of `number-arithmetic-attr-exponent-boundaries`
 * (#3380): an arithmetic result interpolated as text keeps the JavaScript
 * notation at the 1e-6 and 1e21 boundaries — `0.00000123456789` at 1.2e-6,
 * `1.23456789e-7` below it and `1.23456789e+21` at the top.
 */
export const fixture = createFixture({
  id: 'number-arithmetic-text-exponent-boundaries',
  description: 'Text arithmetic spells numbers as JavaScript does at the 1e-6 and 1e21 boundaries',
  source: `
export function NumberArithmeticTextExponent(props: { value: number }) {
  return (
    <div>
      <span>{props.value / 1e15}</span>
      <span>{props.value / 1e16}</span>
      <span>{props.value * 1e12}</span>
    </div>
  )
}
`,
  props: { value: 1234567890 },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->0.00000123456789<!--/--></span>
      <span bf="s3"><!--bf:s2-->1.23456789e-7<!--/--></span>
      <span bf="s5"><!--bf:s4-->1.23456789e+21<!--/--></span>
    </div>
  `,
})
