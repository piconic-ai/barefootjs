import { createFixture } from '../src/types'

/**
 * Filter predicate the compiler can't lower to a template / ParsedExpr subtree
 * at all — a `typeof` guard (`t => typeof t === 'string'`). This is the
 * *not-parseable* off-subset path (a Phase-1 refusal), as opposed to the
 * *parseable-but-evaluator-refuses* nested-callback path
 * (`filter-nested-callback-predicate`, which surfaces BF101 at emit time).
 *
 * Per `spec/callback-fidelity.md` the diagnostic is adapter-gated:
 *   - Hono / CSR run the predicate verbatim (JS runtime) and render the chain
 *     faithfully — the callback stays in the array string for the runtime.
 *   - DSL adapters (Go, Perl, Ruby, PHP, Rust, Python) can't run it at SSR and
 *     surface BF021 with a `/* @client *\/` escape (declared via each adapter's
 *     `conformancePins`). The user opts that piece into client-only rendering.
 *
 * The `/* @client *\/` twin (`filter-typeof-predicate-client`) has no pin —
 * it must render clean on every adapter, asserting the suppression contract.
 */
export const fixture = createFixture({
  id: 'filter-typeof-predicate',
  description: 'Off-subset filter predicate (typeof) — JS-runtime faithful, DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function TypeofPredicate() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <ul>{items().filter(t => typeof t === 'string').map((t, i) => <li key={i}>{String(t)}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})
