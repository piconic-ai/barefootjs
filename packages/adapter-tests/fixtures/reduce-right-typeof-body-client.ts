import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `reduce-right-typeof-body` (#2613). Marking the
 * expression defers `.reduceRight()` to client-only evaluation. No
 * conformance pin: compiles clean, unpinned, non-divergent on every DSL
 * adapter.
 *
 * NOT declared as `reduce-right-typeof-body`'s `escapes` twin — same
 * `generateCsrTemplateWithOpts` markerless bug as `every-typeof-predicate-
 * client` (see that fixture's docstring for the full explanation).
 * CSR-skipped (`csr-skip-set.ts`) pending the compiler fix.
 */
export const fixture = createFixture({
  id: 'reduce-right-typeof-body-client',
  description: 'Off-subset `.reduceRight()` body deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ReduceRightTypeofBodyClient() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <div>{/* @client */ items().reduceRight((acc, t) => { const k = typeof t; return acc + k.length }, 0)}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"></div>
  `,
})
