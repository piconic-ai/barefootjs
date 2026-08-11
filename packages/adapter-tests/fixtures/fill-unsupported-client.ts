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
 * NOT declared as `fill-unsupported`'s `escapes` twin — same
 * `generateCsrTemplateWithOpts` markerless bug as `every-typeof-predicate-
 * client` (see that fixture's docstring for the full explanation; every
 * sibling `*-typeof-*` fixture hits the identical bug, so this is a
 * method-agnostic compiler gap, not something specific to `.fill()`).
 * CSR-skipped (`csr-skip-set.ts`) pending the compiler fix.
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
