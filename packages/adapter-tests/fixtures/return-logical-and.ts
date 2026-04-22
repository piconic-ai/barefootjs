import { createFixture } from '../src/types'

/**
 * Top-level `return cond && <span/>` — BinaryExpression with `&&` at return
 * root. Pre-refactor (before #971 PR 5) the analyzer's recursion-fallback
 * silently picked the JSX on the right and dropped the `&&`, rendering
 * `<span>Shown</span>` unconditionally. The dispatcher unification gives
 * the same semantics as `{cond && <span/>}` in JSX-child position: an
 * `IRConditional` wrapped in a synthetic `<div style="display:contents">`
 * scope anchor. Initial SSR render takes the falsy branch so only the
 * comment markers appear.
 */
export const fixture = createFixture({
  id: 'return-logical-and',
  description: 'Top-level return of logical AND renders conditional, not the JSX unconditionally',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ReturnLogicalAnd() {
  const [show, setShow] = createSignal(false)
  return show() && <span>Shown</span>
}
`,
  expectedHtml: `
    <div style="display:contents" bf-s="test"><!--bf-cond-start:s0--><!--bf-cond-end:s0--></div>
  `,
})
