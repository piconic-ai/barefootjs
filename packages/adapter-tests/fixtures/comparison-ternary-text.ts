import { createFixture } from '../src/types'

/**
 * Comparison operators as ternary conditions in text position:
 * `>=`, `===` against a string, and `!==`. Template languages spell
 * these differently (Go `ge/eq/ne`, Twig/Jinja infix), so each
 * operator exercises a distinct lowering table row.
 */
export const fixture = createFixture({
  id: 'comparison-ternary-text',
  description: 'Comparison operators (>=, ===, !==) as ternary conditions',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ComparisonTernaryText() {
  const [n, setN] = createSignal(7)
  const [mode, setMode] = createSignal('dark')
  return (
    <div>
      <span>{n() >= 10 ? 'big' : 'small'}</span>
      <span>{mode() === 'dark' ? 'night' : 'day'}</span>
      <span>{n() !== 0 ? 'nonzero' : 'zero'}</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf-cond-start:s0-->small<!--bf-cond-end:s0--></span>
      <span bf="s3"><!--bf-cond-start:s2-->night<!--bf-cond-end:s2--></span>
      <span bf="s5"><!--bf-cond-start:s4-->nonzero<!--bf-cond-end:s4--></span>
    </div>
  `,
})
