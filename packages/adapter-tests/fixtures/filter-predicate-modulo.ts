import { createFixture } from '../src/types'

/**
 * #2873 (pullfrog review, PR #2882): `%` (modulo) inside a `.filter()`
 * predicate — the sibling gap to `conditional-class-modulo`'s ternary-
 * condition coverage. `renderFilterExprNode`'s binary-operator switch had
 * the identical missing-`%`-case shape as `renderConditionExpr`'s (both
 * fell through to a literal ` % ` splice, which `html/template` can't
 * parse), fixed the same way (`bf_mod`) — but only the condition-position
 * fix had a fixture. This one closes that gap for the predicate position.
 */
export const fixture = createFixture({
  id: 'filter-predicate-modulo',
  description: '.filter() predicate using % (modulo) (#2873)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: number; n: number }

export function FilterPredicateModulo() {
  const [items] = createSignal<Item[]>([
    { id: 1, n: 1 },
    { id: 2, n: 2 },
    { id: 3, n: 3 },
    { id: 4, n: 4 },
  ])
  return (
    <ul>
      {items().filter(row => row.n % 2 === 0).map(row => (
        <li key={row.id}>{row.n}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="2"><!--bf:s0-->2<!--/--></li>
      <li data-key="4"><!--bf:s0-->4<!--/--></li>
    </ul>
  `,
})
