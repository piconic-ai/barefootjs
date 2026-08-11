// The "loud-or-escapable" floor (#2613): every adapter refusal must carry
// a verified escape, or be named in the shrink-only ledger below.
//
// Domain: every `(adapter, fixture)` pair with an error-severity entry in
// that adapter's `conformancePins` — EXCLUDING fixtures that are *also*
// error-pinned on the reference adapter (`hono`). A fixture the reference
// itself refuses is wrong in itself (its fix is a rewrite, not an escape —
// e.g. BF011 "signal outside component"); that boundary is decided
// mechanically here, by checking the reference's own pins, never by a
// human classifying codes (see #2613, "Where an escape is owed").
//
// For every pair in the domain, exactly one of these must hold:
//   1. the refused fixture declares an `escapes` twin that ACTUALLY WORKS
//      on this adapter — tier 1 (compiles clean, zero error-severity
//      diagnostics) AND tier 2 (unpinned there, absent from
//      `renderDivergences`, not CSR-skipped — the structural proxy for
//      "renders correctly," not re-checked behaviourally here); or
//   2. the pair is named in `KNOWN_UNESCAPABLE`.
//
// COST ORDERING — read this before reaching for either fast path:
// shipping a refusal with NO working escape and NO ledger entry is not an
// option this test allows, but the two paths that ARE allowed are not
// equally expensive, and that asymmetry is deliberate:
//
//   - refuse + ledger line: one `KNOWN_UNESCAPABLE` entry, one issue-URL
//     comment. Costs a single line.
//   - silent divergence (an adapter that compiles clean but produces
//     subtly wrong output): this repo's own rules require the FULL
//     three-piece known-limitation set — a tracked issue, a hand-authored
//     `expectedHtml` pinning the CORRECT output, and per-adapter pins on
//     the broken side (CLAUDE.md, "A reproducible defect lands as a
//     fixture, not a prose report") — and risks tripping the
//     no-silent-divergence trichotomy machinery
//     (`map-body-no-silent-divergence.test.ts`) on top of that.
//
// Refuse-plus-ledger is intentionally the cheap option, not the shameful
// one: when you land a new adapter-specific refusal and don't have (or
// don't yet want to invest in) a verified escape, the FAST PATH is to add
// a `KNOWN_UNESCAPABLE` entry with an issue URL — not to author an escape
// fixture under deadline pressure. Authoring a real twin is the *ratchet*
// (each one deletes ledger lines), never the toll booth blocking a pin
// from landing.
//
// Ledger discipline mirrors `KNOWN_HOLES` in
// `packages/jsx/src/__tests__/map-body-no-silent-divergence.test.ts`
// verbatim in spirit: shrink-only, every entry carries an issue-URL
// comment (falling back to #2613 itself when no more specific issue
// exists yet), and a STALE entry — one whose fixture now has a working
// escape twin — must FAIL the test, not be silently ignored.
//
// Same relative `jsxFixtures` import precedent as compat-pins.test.ts /
// render-divergences.test.ts (see those files' header comments).

import { describe, test, expect } from 'bun:test'
import { jsxFixtures } from '../../../adapter-tests/fixtures'
import { CSR_SKIP_FIXTURES } from '../../../adapter-tests/src/csr-skip-set'
import { loadCompatAdapters } from '../adapter-registry'
import { compileForCompat } from '../engine'

const { loaded } = await loadCompatAdapters()

/**
 * Fixtures the reference adapter (hono) itself error-pins — a
 * compiler-wide refusal, never adapter-specific, so no adapter/fixture
 * pair naming one of these owes an escape (see header comment). Today
 * this is exactly `date-method-uncatalogued` (BF021, #2356): a host
 * rich-typed method call with no catalogued lowering, refused by
 * `checkRichTypeMethodCalls` ahead of `adapter.generate()` — even Hono's
 * native JS evaluation never reaches the call.
 */
const honoAdapter = loaded.find(a => a.id === 'hono')
const honoErrorPinnedFixtures = new Set(
  honoAdapter
    ? Object.entries(honoAdapter.pins)
        .filter(([, pins]) => pins.some(p => p.severity === 'error'))
        .map(([fixtureId]) => fixtureId)
    : [],
)

/**
 * Shrink-only ledger of `"adapterId/fixtureId"` pairs seeded from a real
 * run (#2613 increment 1) that have no working in-corpus escape today.
 * Every entry MUST carry an issue-URL comment (the specific tracking
 * issue where one exists; #2613 itself as the seed-run pointer where it
 * doesn't yet). An entry whose fixture later gains a twin that actually
 * works on that adapter must be REMOVED — this test fails loudly if a
 * listed pair stops needing the ledger, exactly like `KNOWN_HOLES`.
 *
 * Grouped by fixture; the DSL-tier adapter list repeats per group rather
 * than being computed, so each line stays independently grep-able and
 * independently removable as twins are authored (#2613 increment 2+).
 */
const KNOWN_UNESCAPABLE: ReadonlySet<string> = new Set([
  // every-typeof-predicate — off-subset `typeof` guard inside `.every()`.
  // Same DSL-refusal class as `filter-typeof-predicate` (which HAS a
  // `client-directive` twin), but this call site's own twin hasn't been
  // authored yet. https://github.com/piconic-ai/barefootjs/issues/2613
  'blade/every-typeof-predicate',
  'erb/every-typeof-predicate',
  'go-template/every-typeof-predicate',
  'jinja/every-typeof-predicate',
  'mojolicious/every-typeof-predicate',
  'minijinja/every-typeof-predicate',
  'twig/every-typeof-predicate',
  'xslate/every-typeof-predicate',

  // fill-unsupported — `Array.prototype.fill()` has no DSL template
  // lowering. The fixture's own docstring already claims a
  // `/* @client */` escape works here ("the method-agnostic suppression
  // contract is already covered by the filter-*-client twins"), but no
  // twin fixture exercises `.fill()` itself yet — the claim is unverified
  // by this floor until one exists.
  // https://github.com/piconic-ai/barefootjs/issues/2613
  'blade/fill-unsupported',
  'erb/fill-unsupported',
  'go-template/fill-unsupported',
  'jinja/fill-unsupported',
  'mojolicious/fill-unsupported',
  'minijinja/fill-unsupported',
  'twig/fill-unsupported',
  'xslate/fill-unsupported',

  // filter-nested-find-predicate — nested `.find()` callback, the sibling
  // shape of `filter-nested-callback-predicate` (which HAS a twin) under
  // the same #2038/#2320 umbrella. No `-client` twin authored for the
  // `.find()` site specifically yet.
  // https://github.com/piconic-ai/barefootjs/issues/2320
  'blade/filter-nested-find-predicate',
  'erb/filter-nested-find-predicate',
  'go-template/filter-nested-find-predicate',
  'jinja/filter-nested-find-predicate',
  'mojolicious/filter-nested-find-predicate',
  'minijinja/filter-nested-find-predicate',
  'twig/filter-nested-find-predicate',
  'xslate/filter-nested-find-predicate',

  // find-typeof-predicate — off-subset `typeof` guard inside `.find()`.
  // Same class as `every-typeof-predicate` above; no twin yet.
  // https://github.com/piconic-ai/barefootjs/issues/2613
  'blade/find-typeof-predicate',
  'erb/find-typeof-predicate',
  'go-template/find-typeof-predicate',
  'jinja/find-typeof-predicate',
  'mojolicious/find-typeof-predicate',
  'minijinja/find-typeof-predicate',
  'twig/find-typeof-predicate',
  'xslate/find-typeof-predicate',

  // flatmap-typeof-projection — off-subset `typeof` guard inside
  // `.flatMap()`. Same class as the other `*-typeof-*` entries; no twin
  // yet. https://github.com/piconic-ai/barefootjs/issues/2613
  'blade/flatmap-typeof-projection',
  'erb/flatmap-typeof-projection',
  'go-template/flatmap-typeof-projection',
  'jinja/flatmap-typeof-projection',
  'mojolicious/flatmap-typeof-projection',
  'minijinja/flatmap-typeof-projection',
  'twig/flatmap-typeof-projection',
  'xslate/flatmap-typeof-projection',

  // map-array-builder-body — imperative array-builder `.map()` body
  // (`const out = []; for (...) out.push(<td/>); return <tr>{out}</tr>`).
  // DSL adapters refuse with BF021 (no faithful template lowering for an
  // imperative builder); no escape twin authored yet.
  // https://github.com/piconic-ai/barefootjs/issues/2613
  'blade/map-array-builder-body',
  'erb/map-array-builder-body',
  'go-template/map-array-builder-body',
  'jinja/map-array-builder-body',
  'mojolicious/map-array-builder-body',
  'minijinja/map-array-builder-body',
  'twig/map-array-builder-body',
  'xslate/map-array-builder-body',

  // map-array-builder-escaping — the SSR/CSR escaping-parity sibling of
  // `map-array-builder-body`; rides the identical DSL gate (BF021), same
  // no-twin-yet status. https://github.com/piconic-ai/barefootjs/issues/2613
  'blade/map-array-builder-escaping',
  'erb/map-array-builder-escaping',
  'go-template/map-array-builder-escaping',
  'jinja/map-array-builder-escaping',
  'mojolicious/map-array-builder-escaping',
  'minijinja/map-array-builder-escaping',
  'twig/map-array-builder-escaping',
  'xslate/map-array-builder-escaping',

  // preamble-cells — a keyed `.map()` row whose preamble builds a JSX
  // leaf from item state; intentionally DSL-refused (BF021,
  // jsRuntime-only per spec/callback-fidelity.md) BY DESIGN — the
  // fixture's own docstring notes an escape twin would break every DSL
  // integration build if this component were compiled DSL-side at all.
  // No escape authored (or wanted) yet.
  // https://github.com/piconic-ai/barefootjs/issues/2613
  'blade/preamble-cells',
  'erb/preamble-cells',
  'go-template/preamble-cells',
  'jinja/preamble-cells',
  'mojolicious/preamble-cells',
  'minijinja/preamble-cells',
  'twig/preamble-cells',
  'xslate/preamble-cells',

  // reduce-right-typeof-body — off-subset `typeof` guard inside
  // `.reduceRight()`. Same class as the other `*-typeof-*` entries; no
  // twin yet. https://github.com/piconic-ai/barefootjs/issues/2613
  'blade/reduce-right-typeof-body',
  'erb/reduce-right-typeof-body',
  'go-template/reduce-right-typeof-body',
  'jinja/reduce-right-typeof-body',
  'mojolicious/reduce-right-typeof-body',
  'minijinja/reduce-right-typeof-body',
  'twig/reduce-right-typeof-body',
  'xslate/reduce-right-typeof-body',

  // reduce-typeof-body — off-subset `typeof` guard inside `.reduce()`.
  // Same class as the other `*-typeof-*` entries; no twin yet.
  // https://github.com/piconic-ai/barefootjs/issues/2613
  'blade/reduce-typeof-body',
  'erb/reduce-typeof-body',
  'go-template/reduce-typeof-body',
  'jinja/reduce-typeof-body',
  'mojolicious/reduce-typeof-body',
  'minijinja/reduce-typeof-body',
  'twig/reduce-typeof-body',
  'xslate/reduce-typeof-body',

  // some-typeof-predicate — off-subset `typeof` guard inside `.some()`.
  // Same class as the other `*-typeof-*` entries; no twin yet.
  // https://github.com/piconic-ai/barefootjs/issues/2613
  'blade/some-typeof-predicate',
  'erb/some-typeof-predicate',
  'go-template/some-typeof-predicate',
  'jinja/some-typeof-predicate',
  'mojolicious/some-typeof-predicate',
  'minijinja/some-typeof-predicate',
  'twig/some-typeof-predicate',
  'xslate/some-typeof-predicate',

  // static-array-from-props — BF101, a prop-derived computed-const array
  // bound bare to a loop with no DSL binding. #2613 increment 2 is where
  // the `prop-precompute` twin for this (and #2321) gets authored and
  // these lines deleted — explicitly out of scope for increment 1.
  // https://github.com/piconic-ai/barefootjs/issues/2321
  'blade/static-array-from-props',
  'erb/static-array-from-props',
  'go-template/static-array-from-props',
  'jinja/static-array-from-props',
  'mojolicious/static-array-from-props',
  'minijinja/static-array-from-props',
  'twig/static-array-from-props',
  'xslate/static-array-from-props',

  // static-array-from-props-with-component — same #2321 computed-const
  // array refusal, childComponent-in-loop-body variant. Graduates
  // alongside static-array-from-props in increment 2.
  // https://github.com/piconic-ai/barefootjs/issues/2321
  'blade/static-array-from-props-with-component',
  'erb/static-array-from-props-with-component',
  'go-template/static-array-from-props-with-component',
  'jinja/static-array-from-props-with-component',
  'mojolicious/static-array-from-props-with-component',
  'minijinja/static-array-from-props-with-component',
  'twig/static-array-from-props-with-component',
  'xslate/static-array-from-props-with-component',

  // tag-cloud — a signal-driven `.flatMap()` BLOCK body (early return +
  // `const` preamble + keyed leaf); intentionally DSL-refused (BF021) BY
  // DESIGN, same "would break every DSL integration build" reasoning as
  // `preamble-cells` above. No escape authored (or wanted) yet.
  // https://github.com/piconic-ai/barefootjs/issues/2613
  'blade/tag-cloud',
  'erb/tag-cloud',
  'go-template/tag-cloud',
  'jinja/tag-cloud',
  'mojolicious/tag-cloud',
  'minijinja/tag-cloud',
  'twig/tag-cloud',
  'xslate/tag-cloud',
])

/**
 * Tier 1 + tier 2 for one candidate twin on one refusing adapter. Tier 1
 * mirrors `compat-pins.test.ts` / `render-divergences.test.ts`'s own
 * `compileForCompat(..., 'conformance')` replay of the adapter
 * conformance suite's compile shape. Tier 2 reads the same three
 * structural signals the adapter's own conformance suite would gate on
 * (`conformancePins`, `renderDivergences`, the CSR skip set) rather than
 * re-rendering — the render/CSR guarantee comes from those suites
 * actually running, not from this in-process check (see #2613's
 * "In-process compile vs real backend" risk).
 */
function twinWorksOnAdapter(
  twin: (typeof jsxFixtures)[number],
  adapter: (typeof loaded)[number],
): boolean {
  const instance = adapter.factory()
  const errors = compileForCompat(twin.source, 'component.tsx', instance, 'conformance', twin.components)
  const tier1Clean = !errors.some(e => e.severity === 'error')
  const tier2Unpinned = !(twin.id in adapter.pins)
  const tier2NonDivergent = !(twin.id in adapter.renderDivergences)
  const tier2NotCsrSkipped = !CSR_SKIP_FIXTURES.has(twin.id)
  return tier1Clean && tier2Unpinned && tier2NonDivergent && tier2NotCsrSkipped
}

describe('escape coverage — every adapter refusal is escapable or ledgered', () => {
  // Every `(adapter, fixtureId)` pair actually seen in the domain, so the
  // ledger-freshness check below can tell a genuinely-orphaned entry
  // (fixture removed, or no longer error-pinned there) from one still
  // pending an escape.
  const domainKeys = new Set<string>()

  for (const adapter of loaded) {
    describe(adapter.id, () => {
      const domainFixtureIds = Object.entries(adapter.pins)
        .filter(([fixtureId, pins]) => pins.some(p => p.severity === 'error') && !honoErrorPinnedFixtures.has(fixtureId))
        .map(([fixtureId]) => fixtureId)

      for (const id of domainFixtureIds) domainKeys.add(`${adapter.id}/${id}`)

      if (domainFixtureIds.length === 0) {
        test('owes no escape (no adapter-specific error pins)', () => {
          expect(domainFixtureIds).toEqual([])
        })
        return
      }

      for (const fixtureId of domainFixtureIds) {
        test(`[${fixtureId}] escapable or ledgered`, () => {
          const fixture = jsxFixtures.find(f => f.id === fixtureId)
          if (!fixture) {
            throw new Error(
              `stale pin: adapter '${adapter.id}' error-pins fixture '${fixtureId}', which does not exist in jsxFixtures`,
            )
          }

          const ledgerKey = `${adapter.id}/${fixtureId}`
          const isLedgered = KNOWN_UNESCAPABLE.has(ledgerKey)

          const declaredEscapes = fixture.escapes ?? []
          let workingTwinId: string | undefined
          for (const escape of declaredEscapes) {
            const twin = jsxFixtures.find(f => f.id === escape.fixture)
            if (!twin) {
              throw new Error(
                `stale twin: fixture '${fixtureId}' declares an escape twin '${escape.fixture}', which does not exist in jsxFixtures`,
              )
            }
            if (twinWorksOnAdapter(twin, adapter)) {
              workingTwinId = twin.id
              break
            }
          }

          if (isLedgered) {
            if (workingTwinId) {
              throw new Error(
                `stale KNOWN_UNESCAPABLE entry '${ledgerKey}': fixture '${fixtureId}' now has a working ` +
                  `escape twin ('${workingTwinId}') on '${adapter.id}' — remove this ledger entry ` +
                  `(escape-coverage.test.ts).`,
              )
            }
            // Ledgered and still no working twin: expected, passes.
            return
          }

          if (!workingTwinId) {
            throw new Error(
              `[${adapter.id}/${fixtureId}] refused with an error-severity pin but has no verified escape.\n\n` +
                `FAST PATH: add 'KNOWN_UNESCAPABLE = new Set([..., '${ledgerKey}'])' in ` +
                `escape-coverage.test.ts with an issue-URL comment (point at #2613 if no more ` +
                `specific issue exists yet) — this is the intended way to unblock landing the pin, ` +
                `not a stopgap.\n\n` +
                `Only author an escape fixture (declare 'escapes' on '${fixtureId}' pointing at a twin ` +
                `that compiles clean, is unpinned, non-divergent, and not CSR-skipped on '${adapter.id}') ` +
                `if you actually want to close this gap now.`,
            )
          }
        })
      }
    })
  }

  test('every KNOWN_UNESCAPABLE entry matches a live (adapter, fixture) domain pair', () => {
    const orphaned = [...KNOWN_UNESCAPABLE].filter(key => !domainKeys.has(key))
    expect(orphaned).toEqual([])
  })
})
