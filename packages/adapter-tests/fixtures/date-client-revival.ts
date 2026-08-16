import { createFixture } from '../src/types'

/**
 * The sound half of BF021's `/* @client *\/` escape suggestion for a
 * JSON-revivable rich type (`Date`/`URL`, #2636): wrapping the receiver in
 * `new Date(...)` before calling a method on it.
 *
 * `date-method-uncatalogued` pins the REFUSAL this fixture escapes
 * (`toLocaleDateString()` with no explicit locale/timeZone). Before #2636's
 * fix, the refusal's own suggestion recommended a BARE `/* @client *\/` —
 * `{/* @client *\/ createdAt.toLocaleDateString()}` — which compiles clean but
 * crashes at real hydrate: `createdAt` crosses the `bf-p` boundary as JSON
 * and arrives as its `toJSON()` ISO string, not a `Date` instance, so the
 * spliced-verbatim method call throws `TypeError`. `Date` and `URL` are the
 * only two host rich types whose `toJSON()` output round-trips through their
 * own one-argument constructor, so wrapping the receiver — `new
 * Date(createdAt)` — revives it before the method call runs, which IS
 * hydrate-safe. `.getUTCFullYear()`, not `.toLocaleDateString()`, is the
 * method pinned here deliberately: it is deterministic (no ambient
 * locale/timezone read), so this fixture pins the REVIVAL MECHANISM, not a
 * particular method's output.
 *
 * `resolveReceiverType` (rich-type-evidence.ts) only resolves a bare
 * identifier or non-computed member chain — `new Date(createdAt)` is a call
 * result, so it resolves to `null` and BF021 never fires on this shape (see
 * the mirroring silent-case test in `rich-type-method-refusal.test.ts`).
 * SSR renders the `/* @client *\/` region empty (nothing to adopt); the
 * revival only matters at hydrate, so this fixture's compile-time
 * expectedHtml can't itself prove hydrate-soundness — it pins that the
 * escape BF021 recommends compiles clean and uniform across adapters, which
 * is the property this repo can floor-test on every commit.
 */
export const fixture = createFixture({
  id: 'date-client-revival',
  description: 'BF021 escape: /* @client */ with an explicit new Date(...) revival wrapper, hydrate-safe unlike a bare @client call',
  source: `
export function DateClientRevival({ createdAt }: { createdAt: Date }) {
  return <div>{/* @client */ new Date(createdAt).getUTCFullYear()}</div>
}
`,
  props: { createdAt: '2024-01-01T00:00:00.000Z' },
  expectedHtml: `
    <div bf-s="test" bf="s1"></div>
  `,
})
