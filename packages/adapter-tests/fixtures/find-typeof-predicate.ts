import { createFixture } from '../src/types'

/**
 * `Array.prototype.find(pred)` with an off-subset predicate the compiler
 * can't lower to a ParsedExpr subtree — a `typeof` guard. The evaluator
 * refuses the body, so a DSL adapter surfaces the diagnostic at emit time,
 * while a JS-runtime adapter runs it verbatim. The standalone `find`
 * analogue of `filter-typeof-predicate`.
 *
 * Per `spec/callback-fidelity.md` the diagnostic is adapter-gated:
 *   - Hono / CSR run the predicate verbatim (JS runtime) and render `find`'s
 *     result (an element or `undefined`) faithfully.
 *   - DSL adapters (Go, Perl, Ruby, PHP, Rust, Python) can't run it at SSR
 *     and surface BF101 with a `/* @client *\/` escape (declared via each
 *     adapter's `conformancePins`).
 */
export const fixture = createFixture({
  id: 'find-typeof-predicate',
  description: 'Off-subset `.find()` predicate (typeof) — JS-runtime faithful, DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FindTypeofPredicate() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <div>{items().find(t => typeof t === 'string')}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0--><!--/--></div>
  `,
})
