import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `every-typeof-predicate` (#2613). Marking the
 * expression defers `.every()` (and the `String(...)` wrapper around it) to
 * client-only evaluation. No conformance pin: this compiles clean, unpinned
 * and non-divergent on every DSL adapter (SSR HTML matches the Hono
 * reference — an empty `<div>`, no slot markup).
 *
 * NOT declared as `every-typeof-predicate`'s `escapes` twin, though —
 * `csr-conformance.test.ts` (a REAL run, not the floor test's static
 * proxy) shows this is not yet a working escape. It surfaced a genuine
 * compiler bug: `generateCsrTemplateWithOpts` (`html-template.ts`), one of
 * the "CSR emitters" `client-only-elision.ts`'s docstring claims all read
 * `IRExpression.markerless`, does NOT check it for the `case 'expression'`
 * branch — it always emits `<!--bf:sN-->...<!--/-->` for a
 * `clientOnly && slotId` expression regardless of `markerless`. So the
 * standalone CSR template (used for a fresh, non-hydrating mount) embeds
 * marker comments that SSR correctly elides, diverging from
 * `expectedHtml`. This is CSR-skipped (`csr-skip-set.ts`) pending that
 * fix — every sibling `*-typeof-*` / `fill-unsupported` client twin hits
 * the identical bug (bare, non-loop TEXT-expression `/* @client *​/`; the
 * elision machinery IS exercised and works correctly for the pre-existing
 * LOOP-shaped twins, e.g. `filter-typeof-predicate-client`).
 */
export const fixture = createFixture({
  id: 'every-typeof-predicate-client',
  description: 'Off-subset `.every()` predicate deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function EveryTypeofPredicateClient() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <div>{/* @client */ String(items().every(t => typeof t === 'string'))}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"></div>
  `,
})
