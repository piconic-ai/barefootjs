import { createFixture } from '../src/types'

/**
 * Division of two integer operands rendered as text is JavaScript number
 * division: the fractional part survives (`1234567890 / 4` →
 * `308641972.5`), spelled in decimal notation rather than an exponent form.
 */
export const fixture = createFixture({
  id: 'number-division-text',
  description: 'Integer operands divided in text keep the fractional result',
  source: `
export function NumberDivisionText(props: { value: number }) {
  return <div>{props.value / 4}</div>
}
`,
  props: { value: 1234567890 },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->308641972.5<!--/--></div>
  `,
})
