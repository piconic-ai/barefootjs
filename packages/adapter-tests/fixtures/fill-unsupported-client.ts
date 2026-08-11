import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `fill-unsupported` (#2613). Marking the expression
 * defers `.fill()` (and the `.join(',')` after it) to client-only
 * evaluation. No conformance pin: compiles clean, unpinned, non-divergent
 * on every DSL adapter — `fill-unsupported`'s own prior docstring claimed
 * this was "already covered by the filter-*-client twins," but nothing
 * exercised `.fill()` directly until this fixture. That specific claim IS
 * false, though not for a `.fill()`-specific reason.
 *
 * #2617 fixed the `generateCsrTemplateWithOpts` markerless bug (see
 * `every-typeof-predicate-client`'s docstring for the full explanation;
 * every sibling `*-typeof-*` fixture hit the identical bug, so it was a
 * method-agnostic compiler gap, not something specific to `.fill()`). This
 * twin now passes real `csr-conformance.test.ts` execution and is declared
 * as `fill-unsupported`'s `escapes` twin.
 */
export const fixture = createFixture({
  id: 'fill-unsupported-client',
  description: 'Off-subset array method `.fill()` deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FillUnsupportedClient() {
  const [items, setItems] = createSignal<number[]>([])
  return <div>{/* @client */ items().fill(0).join(',')}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"></div>
  `,
})
