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
 *     defers it to client-only rendering.
 *
 * The claim that this is "already covered by the filter-*-client twins"
 * sat unverified until #2613's floor test — and turned out to be FALSE, in
 * an interesting way: a dedicated twin (`fill-unsupported-client`) DOES
 * compile clean, unpinned, and non-divergent on every DSL adapter (tier 1
 * of the floor test), but it does NOT actually render correctly — real
 * `csr-conformance.test.ts` execution shows the compiled client JS's
 * standalone template still embeds `<!--bf:sN-->...<!--/-->` markers that
 * SSR correctly elides, a genuine SSR/CSR divergence in the compiler's
 * `/* @client *\/` marker-elision machinery for a bare (non-loop)
 * TEXT-expression position — see `fill-unsupported-client`'s own docstring.
 * So the suppression contract is method-agnostic (this isn't
 * `.fill()`-specific — every sibling `*-typeof-*` fixture hits the exact
 * same bug), but it is NOT yet a verified WORKING escape. Not declaring
 * `escapes` here until that compiler bug is fixed.
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
