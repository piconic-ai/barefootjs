import { createFixture } from '../src/types'

/**
 * Top-level ternary return (#968).
 *
 * Regression fixture: `return cond ? <A/> : null` at the root of a
 * `"use client"` component previously dropped the conditional — the SSR
 * template always rendered the truthy branch. The compiler now wraps the
 * root in a synthetic `<div style="display:contents">` scope anchor and
 * emits standard `bf-cond-start:sN` / `bf-cond-end:sN` markers for the
 * null branch.
 */
export const fixture = createFixture({
  id: 'top-level-ternary',
  description: 'Top-level ternary return preserves conditional (#968)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function TopTernaryDemo() {
  const [count, setCount] = createSignal(0)
  return count() > 0 ? <span>{count()}</span> : null
}
`,
  expectedHtml: `
    <div style="display:contents" bf-s="test"><!--bf-cond-start:s0--><!--bf-cond-end:s0--></div>
  `,
})
