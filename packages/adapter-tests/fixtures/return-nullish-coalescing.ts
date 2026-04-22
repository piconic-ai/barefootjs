import { createFixture } from '../src/types'

/**
 * Top-level `return prop ?? <Default/>` — BinaryExpression with `??` at
 * return root, JSX on the right. Mirror of `nullish-coalescing-jsx` but
 * at return position. Pre-refactor the analyzer's recursion-fallback
 * silently registered the `<span>Default</span>` as `jsxReturn`, dropping
 * the `??` and the left operand — identical failure mode to #968.
 */
export const fixture = createFixture({
  id: 'return-nullish-coalescing',
  description: 'Top-level return of nullish coalescing with JSX default',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ReturnNullishCoalescing(props: { banner?: any }) {
  const [count, setCount] = createSignal(0)
  return props.banner ?? <span>Default</span>
}
`,
  props: {},
  expectedHtml: `
    <div style="display:contents" bf-s="test"><span bf-c="s0">Default</span></div>
  `,
})
