import { createFixture } from '../src/types'

/**
 * `Array.prototype.fill(value)` — a mutating array method with no template
 * lowering on any DSL adapter (it fills the receiver in place and returns
 * it; there is no ParsedExpr / evaluator form). Before `fill` was gated it
 * was reported "supported" by `isSupported` and the DSL adapters emitted a
 * raw `.fill(...)` method call with no build diagnostic — a silent footgun
 * that only surfaced as a crash at template-render time.
 *
 * Per `spec/callback-fidelity.md` the diagnostic is adapter-gated:
 *   - Hono / CSR run `.fill()` verbatim (JS runtime) and render faithfully.
 *   - DSL adapters (Go, Perl, Ruby, PHP, Rust, Python) can't lower it at SSR
 *     and surface BF101 with a `/* @client *\/` escape (declared via each
 *     adapter's `conformancePins`). Marking the expression `/* @client *\/`
 *     defers it to client-only rendering — the method-agnostic suppression
 *     contract is already covered by the `filter-*-client` twins.
 */
export const fixture = createFixture({
  id: 'fill-unsupported',
  description: 'Off-subset array method `.fill()` — JS-runtime faithful, DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FillUnsupported() {
  const [items, setItems] = createSignal<number[]>([])
  return <div>{items().fill(0).join(',')}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0--><!--/--></div>
  `,
})
