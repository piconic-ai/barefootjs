import { createFixture } from '../src/types'

/**
 * Compiler stress (#1407): two JSX spreads on the same intrinsic element
 * (`<div {...a()} {...b()} />`). Verifies each spread gets its own slot
 * id and the bag-emitting helpers concatenate cleanly.
 *
 * The two bags carry disjoint keys here. When keys overlap, browsers
 * honour the last-seen value (HTML parser semantics) regardless of
 * the lowering's serialisation order — so the user-observable DOM is
 * insensitive to whether the adapter emits in alphabetic order
 * (Go bag-based) or source order (Hono passthrough). Attribute order
 * is normalised in `normalizeHTML` so the cross-adapter comparison
 * stays byte-equal.
 */
export const fixture = createFixture({
  id: 'jsx-spread-multiple',
  description: 'Two JSX spreads on the same element get distinct slot ids',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function JsxSpreadMultiple() {
  const [a, setA] = createSignal<Record<string, string>>({ id: 'x' })
  const [b, setB] = createSignal<Record<string, string>>({ class: 'y' })
  return <div onClick={() => setA({ id: 'x2' })} {...a()} {...b()} />
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s0" class="y" id="x"></div>
  `,
})
