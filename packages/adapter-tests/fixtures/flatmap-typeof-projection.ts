import { createFixture } from '../src/types'

/**
 * `Array.prototype.flatMap(fn)` with an off-subset projection body the
 * compiler can't lower to a ParsedExpr subtree — it branches on `typeof`.
 * The evaluator refuses the body, so a DSL adapter surfaces the diagnostic
 * at emit time, while a JS-runtime adapter runs it verbatim. The standalone
 * (value-projection) `flatMap` analogue of `filter-typeof-predicate`.
 * (Rendered value is empty — the projection maps the empty seed to `[]`.)
 *
 * Per `spec/callback-fidelity.md` the diagnostic is adapter-gated:
 *   - Hono / CSR run the projection verbatim (JS runtime) and render the
 *     flattened result faithfully.
 *   - DSL adapters (Go, Perl, Ruby, PHP, Rust, Python) can't run it at SSR
 *     and surface BF101 with a `/* @client *\/` escape (declared via each
 *     adapter's `conformancePins`).
 */
export const fixture = createFixture({
  id: 'flatmap-typeof-projection',
  description: 'Off-subset `.flatMap()` projection (typeof) — JS-runtime faithful, DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FlatMapTypeofProjection() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <div>{items().flatMap(t => typeof t === 'string' ? [t] : []).join(',')}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0--><!--/--></div>
  `,
})
