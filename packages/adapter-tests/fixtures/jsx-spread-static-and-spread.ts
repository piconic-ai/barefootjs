import { createFixture } from '../src/types'

/**
 * Compiler stress (#1407): static attribute alongside a JSX spread
 * (`<div class="x" {...rest()} />`). Browsers honour the last-seen
 * value when an attribute is duplicated, so when `rest` carries a
 * `class` key the spread's value wins regardless of source order.
 *
 * This fixture pins the disjoint-keys case (static `class`, spread
 * `id`); the overlapping-keys case is implementation-defined per
 * adapter (last-wins) and intentionally not covered by a fixture.
 */
export const fixture = createFixture({
  id: 'jsx-spread-static-and-spread',
  description: 'Static attribute mixed with a JSX spread carrying disjoint keys',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function JsxSpreadStaticAndSpread() {
  const [rest, setRest] = createSignal<Record<string, string>>({ id: 'a' })
  return <div class="static-class" onClick={() => setRest({ id: 'b' })} {...rest()} />
}
`,
  expectedHtml: `
    <div class="static-class" id="a" bf-s="test" bf="s0"></div>
  `,
})
