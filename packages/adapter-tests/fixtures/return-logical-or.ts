import { createFixture } from '../src/types'

/**
 * Top-level `return prop || <Fallback/>` — BinaryExpression with `||` at
 * return root, JSX on the right. Pairs with `return-nullish-coalescing`
 * and `return-logical-and` to cover all three operator-gated forms at
 * return position. Mirrors JSX-child `logical-or-jsx` semantics: an
 * `IRConditional` wrapped in a synthetic scope anchor. With the default
 * props (no `label`), SSR takes the falsy branch and renders the
 * `<span>Fallback</span>` through the `bf-c` marker.
 */
export const fixture = createFixture({
  id: 'return-logical-or',
  description: 'Top-level return of logical OR with JSX fallback',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ReturnLogicalOr(props: { label?: string }) {
  const [count, setCount] = createSignal(0)
  return props.label || <span>Fallback</span>
}
`,
  props: {},
  expectedHtml: `
    <div style="display:contents" bf-s="test"><span bf-c="s0">Fallback</span></div>
  `,
})
