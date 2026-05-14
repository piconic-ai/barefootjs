import { createFixture } from '../src/types'

/**
 * Nullish coalescing (??) with JSX on the right-hand side, in JSX-child
 * position.
 *
 * `nullish-coalescing-text` covers ?? with a scalar right (text fallback).
 * This fixture covers the sibling JSX branch of the same dispatcher path
 * (`transformExpression` gated by `containsJsxInExpression(right)`).
 * Matrix cell: BinaryExpression(`??`) × JSX child, JSX right.
 */
export const fixture = createFixture({
  id: 'nullish-coalescing-jsx',
  description: 'Nullish coalescing with JSX fallback in JSX child position',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NullishCoalescingJsx(props: { banner?: any }) {
  const [count, setCount] = createSignal(0)
  return <div>{props.banner ?? <span>Default</span>}</div>
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test" bf="s1"><span bf-c="s0">Default</span></div>
  `,
})
