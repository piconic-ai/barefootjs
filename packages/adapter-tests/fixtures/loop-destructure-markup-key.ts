import { createFixture } from '../src/types'

/**
 * A `.map()` row destructures a key that is not an identifier and holds
 * `<` (`({ 'a<b': v })`). The row accessor reads it as `item["a<b"]`, a
 * string literal written into the client JS; it must still name the key.
 */
export const fixture = createFixture({
  id: 'loop-destructure-markup-key',
  description: 'A loop row destructures a quoted key holding <',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function LoopDestructureMarkupKey() {
  const [items] = createSignal([{ 'a<b': 'one' }, { 'a<b': 'two' }])
  return <ul>{items().map(({ 'a<b': v }) => <li key={v}>{v}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="one"><!--bf:s0-->one<!--/--></li>
      <li data-key="two"><!--bf:s0-->two<!--/--></li>
    </ul>
  `,
})
