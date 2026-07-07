import { createFixture } from '../src/types'

/**
 * Arithmetic on a signal getter inside a text expression. The SSR side
 * must fold `count() * 2 + 1` against the initial value with JS
 * operator precedence, not just print the getter's raw value.
 */
export const fixture = createFixture({
  id: 'arithmetic-text',
  description: 'Arithmetic expression over a signal in text content',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ArithmeticText() {
  const [count, setCount] = createSignal(4)
  return (
    <div>
      <span>{count() * 2 + 1}</span>
      <span>{count() - 1}</span>
      <span>{(count() + 2) * 3}</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->9<!--/--></span>
      <span bf="s3"><!--bf:s2-->3<!--/--></span>
      <span bf="s5"><!--bf:s4-->18<!--/--></span>
    </div>
  `,
})
