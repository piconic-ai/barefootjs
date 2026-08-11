import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `reduce-typeof-body` (#2613). Marking the
 * expression defers `.reduce()` to client-only evaluation. No conformance
 * pin: compiles clean, unpinned, non-divergent on every DSL adapter.
 *
 * #2617 fixed the `generateCsrTemplateWithOpts` markerless bug (see
 * `every-typeof-predicate-client`'s docstring for the full explanation);
 * this twin now passes real `csr-conformance.test.ts` execution and is
 * declared as `reduce-typeof-body`'s `escapes` twin.
 */
export const fixture = createFixture({
  id: 'reduce-typeof-body-client',
  description: 'Off-subset `.reduce()` body deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ReduceTypeofBodyClient() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <div>{/* @client */ items().reduce((acc, t) => { const k = typeof t; return acc + k.length }, 0)}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"></div>
  `,
})
