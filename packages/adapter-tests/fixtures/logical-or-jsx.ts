import { createFixture } from '../src/types'

/**
 * Logical OR with JSX on the right-hand side, in JSX-child position.
 *
 * Covers `transformExpression` + `transformNullishCoalescing` for operator
 * `||`, gated by `containsJsxInExpression(right)`. Pairs with
 * `nullish-coalescing-text` (?? with scalar right) and
 * `nullish-coalescing-jsx` (?? with JSX right). Matrix cell:
 * BinaryExpression(`||`) × JSX child.
 */
export const fixture = createFixture({
  id: 'logical-or-jsx',
  description: 'Logical OR with JSX fallback in JSX child position',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function LogicalOrJsx(props: { label?: string }) {
  const [count, setCount] = createSignal(0)
  return <div>{props.label || <span>Fallback</span>}</div>
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test" bf="s1"><span bf-c="s0">Fallback</span></div>
  `,
})
