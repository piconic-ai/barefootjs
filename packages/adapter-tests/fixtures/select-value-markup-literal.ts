import { createFixture } from '../src/types'

/**
 * Controlled `<select value={…}>` whose `<option>` values hold `<` and `>`.
 * Each option's `selected` compares the controlled value against the
 * option's literal value, and that literal is written into the client JS
 * and every template as a string literal. The literal must still be the
 * option's value: only `x < y` is selected.
 */
export const fixture = createFixture({
  id: 'select-value-markup-literal',
  description: 'A controlled select compares against option values holding < and > as written',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function SelectValueMarkupLiteral() {
  const [val] = createSignal('x < y')
  return (
    <select value={val()}>
      <option value="a">A</option>
      <option value="x < y">X</option>
      <option value="</script>">S</option>
    </select>
  )
}
`,
  expectedHtml: `
    <select bf-s="test" bf="s0">
      <option disabled hidden value=""></option>
      <option value="a">A</option>
      <option selected value="x &lt; y">X</option>
      <option value="&lt;/script&gt;">S</option>
    </select>
  `,
})
