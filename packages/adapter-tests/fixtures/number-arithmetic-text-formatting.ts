import { createFixture } from '../src/types'

/**
 * Sibling of `number-addition-text-formatting`: arithmetic results rendered
 * as text use the JavaScript number spelling — decimal below 1e21, no Go
 * `%v` exponent form — for subtraction, multiplication, a template-literal
 * interpolation, a signal operand and a unary minus. Division has its own
 * fixture, `number-division-text`.
 */
export const fixture = createFixture({
  id: 'number-arithmetic-text-formatting',
  description: 'Arithmetic results in text use JavaScript number spelling',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NumericArithmeticText(props: { value: number }) {
  const [n] = createSignal(1234567890)
  return (
    <div>
      <span>{props.value - 0.25}</span>
      <span>{props.value * 1000}</span>
      <span>{\`v=\${props.value + 0.5}\`}</span>
      <span>{n() + 0.5}</span>
      <span>{-props.value}</span>
    </div>
  )
}
`,
  props: { value: 1234567890 },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->1234567889.75<!--/--></span>
      <span bf="s3"><!--bf:s2-->1234567890000<!--/--></span>
      <span bf="s5"><!--bf:s4-->v=1234567890.5<!--/--></span>
      <span bf="s7"><!--bf:s6-->1234567890.5<!--/--></span>
      <span bf="s9"><!--bf:s8-->-1234567890<!--/--></span>
    </div>
  `,
})
