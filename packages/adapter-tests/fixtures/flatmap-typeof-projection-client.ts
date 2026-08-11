import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `flatmap-typeof-projection` (#2613). Marking the
 * expression defers `.flatMap()` (and the `.join(',')` after it) to
 * client-only evaluation. No conformance pin: compiles clean, unpinned,
 * non-divergent on every DSL adapter.
 *
 * NOT declared as `flatmap-typeof-projection`'s `escapes` twin — same
 * `generateCsrTemplateWithOpts` markerless bug as `every-typeof-predicate-
 * client` (see that fixture's docstring for the full explanation).
 * CSR-skipped (`csr-skip-set.ts`) pending the compiler fix.
 */
export const fixture = createFixture({
  id: 'flatmap-typeof-projection-client',
  description: 'Off-subset `.flatMap()` projection deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FlatMapTypeofProjectionClient() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <div>{/* @client */ items().flatMap(t => typeof t === 'string' ? [t] : []).join(',')}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"></div>
  `,
})
