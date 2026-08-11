import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `find-typeof-predicate` (#2613). Marking the
 * expression defers `.find()` to client-only evaluation. No conformance
 * pin: compiles clean, unpinned, non-divergent on every DSL adapter.
 *
 * #2617 fixed the `generateCsrTemplateWithOpts` markerless bug (see
 * `every-typeof-predicate-client`'s docstring for the full explanation);
 * this twin now passes real `csr-conformance.test.ts` execution and is
 * declared as `find-typeof-predicate`'s `escapes` twin.
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
