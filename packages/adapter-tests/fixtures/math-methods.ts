import { createFixture } from '../src/types'

/**
 * Well-known `Math.*` builtins over a signal: `min`, `max`, `abs`,
 * `floor`. These route through the identifier-path template-primitive
 * registry on template adapters (see `templatePrimitives`), so each
 * call is a registry-coverage probe.
 */
export const fixture = createFixture({
  id: 'math-methods',
  description: 'Math.min/max/abs/floor over a signal in text content',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function MathMethods() {
  const [n, setN] = createSignal(-7.6)
  return (
    <div>
      <span>{Math.min(n(), 10)}</span>
      <span>{Math.max(n(), 0)}</span>
      <span>{Math.abs(n())}</span>
      <span>{Math.floor(n())}</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->-7.6<!--/--></span>
      <span bf="s3"><!--bf:s2-->0<!--/--></span>
      <span bf="s5"><!--bf:s4-->7.6<!--/--></span>
      <span bf="s7"><!--bf:s6-->-8<!--/--></span>
    </div>
  `,
})
