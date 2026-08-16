import { createFixture } from '../src/types'

/**
 * A method call on a `Date`-typed prop with no catalogued lowering: the
 * zero-arg `toLocaleDateString()` stays permanently uncatalogued because
 * it resolves against the runtime environment's ambient default locale
 * (ICU/CLDR-dependent), which is not knowable at build time and differs
 * across every backend language. Tracked as a by-design known limitation
 * in #2356 (the enabling issues #2273/#2274 that left this refusal in
 * place are both closed as completed). Literal-locale and named-timezone
 * forms DO compile — see `date-tolocale-literal` / `date-tolocale-named-tz`.
 *
 * Every adapter shares the same compiler-level BF021 refusal ahead of
 * `adapter.generate()`, so this fixture is pinned identically across all
 * nine adapters' own `conformance-pins.ts` — including Hono, DELIBERATELY,
 * not as copied DSL caution. A Hono carve-out was evaluated (#2356 decision
 * comment) and rejected on two independently-verified grounds, not "Hono
 * runs real JS so it must be fine":
 *
 *   1. Hydration re-evaluates this expression, it doesn't adopt SSR text.
 *      A prop-derived text slot compiles to `createEffect(() => { const
 *      __val = <expr>; __bfw_s0(...) })` (`ir-to-client-js/emit-reactive.ts`),
 *      and `createEffect` runs its body synchronously on creation
 *      (`packages/client/src/reactive.ts` `runEffect`) — confirmed by
 *      compiling the analogous `{label.toUpperCase()}` shape and reading the
 *      emitted `initX` function directly. So a carve-out would not just
 *      "let Hono evaluate the call at SSR" — it would ALSO make the client
 *      evaluate it again at hydrate-init, unconditionally.
 *   2. The receiver it would evaluate against is de-riched. Props cross the
 *      `bf-p` hydration boundary as `JSON.parse`d data with no type-aware
 *      revival (`packages/client/src/runtime/hydrate.ts` `parseProps`;
 *      documented in `packages/client/src/runtime/date.ts`'s header), so a
 *      `Date`-typed prop arrives at hydrate as its `toJSON()` ISO string,
 *      not a `Date` instance. A carved-out zero-arg `.toLocaleDateString()`
 *      would therefore call a STRING method that doesn't exist —
 *      `TypeError` at hydrate, in every real Hono app rendering this shape,
 *      strictly worse than today's clean, fix-forward BF021 at build time.
 *
 * (A coercing runtime helper, mirroring `date()` for the catalogued
 * accessors, would dodge the TypeError but not the underlying problem: it
 * would substitute the BROWSER's ambient locale for the SERVER's at
 * hydrate, a silent SSR/CSR divergence — exactly what `spec/subset-
 * conformance.md`'s post-hydration-DOM-equality principle rules out.)
 *
 * So this is not adapter-specific debt kept uniform for simplicity; it is
 * uniform because the SAME defect (an ambient-locale read with no faithful
 * cross-environment lowering) recurs on Hono's own hydrate leg, not only on
 * the 8 DSL adapters' template leg.
 *
 * `escapes` twin: `date-client-revival`. BF021's suggestion for this refusal
 * no longer recommends a bare `/* @client *\/` (#2636 — unsound for the same
 * hydrate-time-JSON reason laid out above); the twin demonstrates the
 * genuinely hydrate-safe form, `new Date(createdAt)...`.
 */
export const fixture = createFixture({
  id: 'date-method-uncatalogued',
  description: 'Method call on a Date-typed prop refuses with BF021 (no catalogued lowering)',
  source: `
export function DateMethodUncatalogued({ createdAt }: { createdAt: Date }) {
  return <div>{createdAt.toLocaleDateString()}</div>
}
`,
  props: { createdAt: '2024-01-01T00:00:00.000Z' },
  escapes: [{ kind: 'client-directive', fixture: 'date-client-revival' }],
})
