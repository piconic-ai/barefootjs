import { createFixture } from '../src/types'

/**
 * A CATALOGUED Date method (`.toISOString()`, #2292) called directly inside
 * `/* @client *\/` — no `new Date(...)` revival wrapper needed (#2640).
 *
 * `date-client-revival` pins the revival-wrapper escape for an UNCATALOGUED
 * method (`.toLocaleDateString()` with no explicit locale). This fixture is
 * its sibling for the opposite case: `.toISOString()` already has a
 * cross-adapter lowering, so before #2640's fix, `emitClientOnlyExpressions`
 * spliced the call verbatim into the `createEffect` body — compiling clean
 * (BF021 never fires; `/* @client *\/` opts out of the SSR check) but
 * crashing at real hydrate, because the receiver still crosses the `bf-p`
 * boundary as its `toJSON()` ISO string, and `.toISOString()` on a plain
 * string is a `TypeError`. `makeCataloguedCallLowerer`
 * (`ir-to-client-js/emit-reactive.ts`) now routes this call through the same
 * `date()` runtime helper the non-`@client` reactive-text path already used
 * (#2292) — the emitted effect reads `date(createdAt, "toISOString")`, not
 * `createdAt.toISOString()`.
 *
 * SSR renders the `/* @client *\/` region empty (nothing to adopt); the fix
 * only matters at hydrate, so this fixture (like `date-client-revival`)
 * pins clean, uniform compilation across adapters — the compiler-level
 * regression test in `client-only-date-lowering.test.ts` is what actually
 * asserts the emitted `date(...)` call, and `date-lowering-hydration.test.ts`
 * (packages/client) proves it doesn't throw against a real, JSON-round-
 * tripped prop.
 *
 * This fixture's bare-destructured-prop method-call shape also caught a
 * SEPARATE, pre-existing bug (#2645): `irToComponentTemplateWithOpts`'s
 * `'expression'` case never checked `node.clientOnly`, so it inlined the
 * `@client` value into the CSR/static template instead of eliding it like
 * SSR does (a real SSR/CSR byte-parity violation, not a harness artifact).
 * Fixed by adding the same `clientOnly && slotId` / `markerless` branch
 * `generateCsrTemplateWithOpts` already had — this fixture (previously
 * `CSR_SKIP_FIXTURES`-pinned) is now that fix's CSR-conformance regression
 * pin, alongside the #2640 hydrate-execution coverage above.
 */
export const fixture = createFixture({
  id: 'date-client-catalogued',
  description: '/* @client */ with a catalogued Date method (toISOString) — no revival wrapper needed, hydrate-safe via date()',
  source: `
export function DateClientCatalogued({ createdAt }: { createdAt: Date }) {
  return <div>{/* @client */ createdAt.toISOString()}</div>
}
`,
  props: { createdAt: '2024-01-01T00:00:00.000Z' },
  expectedHtml: `
    <div bf-s="test" bf="s1"></div>
  `,
})
