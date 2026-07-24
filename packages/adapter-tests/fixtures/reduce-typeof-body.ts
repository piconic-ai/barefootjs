import { createFixture } from '../src/types'

/**
 * `Array.prototype.reduce(fn, init)` with an off-subset reducer body the
 * compiler can't lower to a ParsedExpr subtree — it reads `typeof`. The
 * evaluator refuses the body, so a DSL adapter surfaces the diagnostic at
 * emit time, while a JS-runtime adapter runs it verbatim. The standalone
 * `reduce` analogue of `filter-typeof-predicate`. (Rendered value is `0` —
 * the reducer never runs over the empty seed, so the initial value stands.)
 *
 * Per `spec/callback-fidelity.md` the diagnostic is adapter-gated:
 *   - Hono / CSR run the reducer verbatim (JS runtime) and render the fold
 *     result faithfully.
 *   - DSL adapters (Go, Perl, Ruby, PHP, Rust, Python) can't run it at SSR
 *     and surface BF101 with a `/* @client *\/` escape (declared via each
 *     adapter's `conformancePins`).
 */
export const fixture = createFixture({
  id: 'reduce-typeof-body',
  description: 'Off-subset `.reduce()` body (typeof) — JS-runtime faithful, DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ReduceTypeofBody() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <div>{items().reduce((acc, t) => { const k = typeof t; return acc + k.length }, 0)}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->0<!--/--></div>
  `,
})
