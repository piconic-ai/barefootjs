import { createFixture } from '../src/types'

/**
 * `Array.prototype.reduceRight(fn, init)` with an off-subset reducer body
 * (`typeof`). The evaluator refuses the body, so a DSL adapter surfaces the
 * diagnostic at emit time, while a JS-runtime adapter runs it verbatim. The
 * standalone `reduceRight` analogue of `filter-typeof-predicate`. (Rendered
 * value is `0` — the reducer never runs over the empty seed.)
 *
 * Per `spec/callback-fidelity.md` the diagnostic is adapter-gated:
 *   - Hono / CSR run the reducer verbatim (JS runtime) and render the fold
 *     result faithfully.
 *   - DSL adapters (Go, Perl, Ruby, PHP, Rust, Python) can't run it at SSR
 *     and surface BF101 with a `/* @client *\/` escape (declared via each
 *     adapter's `conformancePins`).
 */
export const fixture = createFixture({
  id: 'reduce-right-typeof-body',
  description: 'Off-subset `.reduceRight()` body (typeof) — JS-runtime faithful, DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ReduceRightTypeofBody() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <div>{items().reduceRight((acc, t) => { const k = typeof t; return acc + k.length }, 0)}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->0<!--/--></div>
  `,
})
