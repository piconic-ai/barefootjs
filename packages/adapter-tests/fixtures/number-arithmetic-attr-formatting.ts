import { createFixture } from '../src/types'

/**
 * Attribute-position sibling of `number-arithmetic-text-formatting`:
 * arithmetic results in an attribute value use the JavaScript number
 * spelling — decimal below 1e21, no exponent form — for addition,
 * division, a template-literal interpolation and a signal operand.
 */
export const fixture = createFixture({
  id: 'number-arithmetic-attr-formatting',
  description: 'Arithmetic results in attribute values use JavaScript number spelling',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NumberArithmeticAttr(props: { value: number }) {
  const [n] = createSignal(1234567890)
  return (
    <div
      data-sum={props.value + 0.5}
      data-ratio={props.value / 4}
      data-label={\`v=\${props.value * 1000}\`}
      data-next={n() + 0.5}
    >
      x
    </div>
  )
}
`,
  props: { value: 1234567890 },
  expectedHtml: `
    <div bf-s="test" bf="s0" data-label="v=1234567890000" data-next="1234567890.5" data-ratio="308641972.5" data-sum="1234567890.5">x</div>
  `,
})
