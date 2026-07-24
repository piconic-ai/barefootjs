import { createFixture } from '../src/types'

/**
 * `Array.prototype.some(pred)` with an off-subset predicate the compiler
 * can't lower to a ParsedExpr subtree — a `typeof` guard. The evaluator
 * refuses the body, so a DSL adapter surfaces the diagnostic at emit time,
 * while a JS-runtime adapter runs it verbatim. The standalone `some`
 * analogue of `filter-typeof-predicate`. (Rendered value is `false` — no
 * element in the empty seed satisfies the predicate.)
 *
 * Per `spec/callback-fidelity.md` the diagnostic is adapter-gated:
 *   - Hono / CSR run the predicate verbatim (JS runtime) and render `some`'s
 *     boolean result faithfully.
 *   - DSL adapters (Go, Perl, Ruby, PHP, Rust, Python) can't run it at SSR
 *     and surface BF101 with a `/* @client *\/` escape (declared via each
 *     adapter's `conformancePins`).
 */
export const fixture = createFixture({
  id: 'some-typeof-predicate',
  description: 'Off-subset `.some()` predicate (typeof) — JS-runtime faithful, DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SomeTypeofPredicate() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <div>{String(items().some(t => typeof t === 'string'))}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->false<!--/--></div>
  `,
})
