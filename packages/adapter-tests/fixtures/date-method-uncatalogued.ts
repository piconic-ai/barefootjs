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
 * nine adapters' own `conformance-pins.ts` (including Hono, whose real-JS
 * runtime could otherwise evaluate the call) rather than being
 * adapter-specific.
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
})
