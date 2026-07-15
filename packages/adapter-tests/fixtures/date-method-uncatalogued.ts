import { createFixture } from '../src/types'

/**
 * A method call on a `Date`-typed prop with no catalogued lowering
 * (`toLocaleDateString` — locale/format-argument formatting stays
 * permanently uncatalogued; #2273). Every adapter shares the same
 * compiler-level BF021 refusal ahead of `adapter.generate()`, so this
 * fixture is pinned identically across all nine adapters' own
 * `conformance-pins.ts` (including Hono, whose real-JS runtime could
 * otherwise evaluate the call) rather than being adapter-specific.
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
