import { createFixture } from '../src/types'

/**
 * The notation-boundary half of `number-arithmetic-attr-forms` (#3359):
 * JavaScript prints a number in decimal form within [1e-6, 1e21) and with an
 * unpadded, lower-case exponent outside it — `0.00000123456789` at 1.2e-6,
 * `1.23456789e-7` below it and `1.23456789e+21` at the top.
 */
export const fixture = createFixture({
  id: 'number-arithmetic-attr-exponent-boundaries',
  description: 'Attribute arithmetic spells numbers as JavaScript does at the 1e-6 and 1e21 boundaries',
  source: `
export function NumberArithmeticAttrExponent(props: { value: number }) {
  return (
    <div
      data-small={props.value / 1e15}
      data-tiny={props.value / 1e16}
      data-big={props.value * 1e12}
    >
      x
    </div>
  )
}
`,
  props: { value: 1234567890 },
  expectedHtml: `
    <div bf-s="test" bf="s0" data-big="1.23456789e+21" data-small="0.00000123456789" data-tiny="1.23456789e-7">x</div>
  `,
})
