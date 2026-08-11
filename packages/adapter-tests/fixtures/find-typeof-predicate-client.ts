import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `find-typeof-predicate` (#2613). Marking the
 * expression defers `.find()` to client-only evaluation. No conformance
 * pin: compiles clean, unpinned, non-divergent on every DSL adapter.
 *
 * NOT declared as `find-typeof-predicate`'s `escapes` twin — same
 * `generateCsrTemplateWithOpts` markerless bug as `every-typeof-predicate-
 * client` (see that fixture's docstring for the full explanation).
 * CSR-skipped (`csr-skip-set.ts`) pending the compiler fix.
 */
export const fixture = createFixture({
  id: 'find-typeof-predicate-client',
  description: 'Off-subset `.find()` predicate deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FindTypeofPredicateClient() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <div>{/* @client */ items().find(t => typeof t === 'string')}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"></div>
  `,
})
