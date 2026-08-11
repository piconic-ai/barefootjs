import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `every-typeof-predicate` (#2613). Marking the
 * expression defers `.every()` (and the `String(...)` wrapper around it) to
 * client-only evaluation. No conformance pin: this compiles clean, unpinned
 * and non-divergent on every DSL adapter (SSR HTML matches the Hono
 * reference — an empty `<div>`, no slot markup).
 *
 * At authoring time this was NOT yet declared as `every-typeof-predicate`'s
 * `escapes` twin: `csr-conformance.test.ts` (a REAL run, not the floor
 * test's static proxy) showed this was not yet a working escape. It
 * surfaced a genuine compiler bug: `generateCsrTemplateWithOpts`
 * (`html-template.ts`), one of the "CSR emitters" `client-only-elision.ts`'s
 * docstring claims all read `IRExpression.markerless`, did NOT check it
 * for the `case 'expression'` branch — it always emitted
 * `<!--bf:sN-->...<!--/-->` for a `clientOnly && slotId` expression
 * regardless of `markerless`. So the standalone CSR template (used for a
 * fresh, non-hydrating mount) embedded marker comments that SSR correctly
 * elided, diverging from `expectedHtml`. Every sibling `*-typeof-*` /
 * `fill-unsupported` client twin hit the identical bug (bare, non-loop
 * TEXT-expression `/* @client *​/`; the elision machinery WAS already
 * exercised and worked correctly for the pre-existing LOOP-shaped twins,
 * e.g. `filter-typeof-predicate-client`, which have no separate markerless
 * slot in play — their container element is the mount anchor either way).
 *
 * #2617 fixed `generateCsrTemplateWithOpts` to consult `markerless` the
 * same way `irToHtmlTemplate` already did; this twin now passes real
 * `csr-conformance.test.ts` execution (no longer CSR-skipped — see
 * `csr-skip-set.ts`) and is declared as `every-typeof-predicate`'s
 * `escapes` twin.
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
