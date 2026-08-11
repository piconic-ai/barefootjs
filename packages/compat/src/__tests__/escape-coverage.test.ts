// The "loud-or-escapable" floor (#2613): every adapter refusal must carry
// a verified escape, or that adapter's OWN `conformancePins` entry must
// declare it `unescapable`.
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
//   2. the adapter's OWN error pin for this fixture carries
//      `unescapable: { issue }` (`ConformancePin`, `@barefootjs/jsx`); or
//   3. the fixture declares `escapeNotOwed: { reason }` — an explicit,
//      required-non-empty prose declaration that NO escape is owed here,
//      by design (not merely "not authored yet") — see `EscapeNotOwed` in
//      `packages/adapter-tests/src/types.ts`. Distinct from (2):
//      `unescapable` means "an escape is owed but not authored yet";
//      `escapeNotOwed` means "will never happen", so a by-design refusal
//      doesn't sit forever as per-adapter debt that can never legitimately
//      reach zero. Mutually exclusive with (2) for the same pair (enforced
//      below). The reason is folded into the TEST NAME so it is visible in
//      ordinary `bun test` output, not hidden behind a boolean.
//
// COST ORDERING — read this before reaching for either fast path:
// shipping a refusal with NO working escape and NO `unescapable`
// declaration is not an option this test allows, but the two paths that
// ARE allowed are not equally expensive, and that asymmetry is deliberate:
//
//   - refuse + `unescapable: { issue }` on the pin: one field, one issue
//     URL, in the SAME object literal as the refusal it qualifies. Costs
//     a single line, in the adapter's own package.
//   - silent divergence (an adapter that compiles clean but produces
//     subtly wrong output): this repo's own rules require the FULL
//     three-piece known-limitation set — a tracked issue, a hand-authored
//     `expectedHtml` pinning the CORRECT output, and per-adapter pins on
//     the broken side (CLAUDE.md, "A reproducible defect lands as a
//     fixture, not a prose report") — and risks tripping the
//     no-silent-divergence trichotomy machinery
//     (`map-body-no-silent-divergence.test.ts`) on top of that.
//
// Refuse-plus-`unescapable` is intentionally the cheap option, not the
// shameful one: when you land a new adapter-specific refusal and don't
// have (or don't yet want to invest in) a verified escape, the FAST PATH
// is to set `unescapable: { issue: '<url>' }` on that pin, in YOUR
// adapter's own `conformance-pins.ts` — not to author an escape fixture
// under deadline pressure. Authoring a real twin is the *ratchet* (it
// deletes the `unescapable` field), never the toll booth blocking a pin
// from landing.
//
// WHY THIS LIVES ON THE PIN, NOT IN A CENTRAL SET: increment 1 shipped a
// `KNOWN_UNESCAPABLE: ReadonlySet<"adapterId/fixtureId">` hardcoded in
// THIS file — 112 adapter/fixture strings, naming every DSL adapter by
// id. That inverted the dependency this repo otherwise enforces
// everywhere else (`conformancePins`, `renderDivergences`): an adapter
// package is supposed to be the sole author of what it knows about its
// own refusals, and a community member adding a 9th adapter (#2101-#2103)
// should never have to edit a core `packages/compat` test to land it.
// `unescapable` fixes that: it rides along on the SAME `ConformancePin`
// object the adapter already owns, so a new adapter is covered by this
// floor test automatically, the moment it's wired into
// `loadCompatAdapters()` — no line in this file, or in any fixture, ever
// needs to change for that to happen. This test's own domain and ledger
// are both derived entirely from `loadCompatAdapters()` below; nothing in
// this file names an adapter package or id. `escape-coverage-additivity.test.ts`
// backstops that claim mechanically (it derives its forbidden-name list
// from `loadCompatAdapters()` too, so it never needs updating either).
//
// Shrink-only discipline mirrors `KNOWN_HOLES` in
// `packages/jsx/src/__tests__/map-body-no-silent-divergence.test.ts`
// verbatim in spirit — now enforced per adapter package instead of in one
// central set: every `unescapable` carries an issue-URL (falling back to
// #2613 itself when no more specific issue exists yet), and a STALE
// declaration — one whose fixture now has a working escape twin on THAT
// adapter — must FAIL the test, not be silently ignored. Each adapter's
// own remaining `unescapable` count is now visible in its own package,
// which is an improvement over a central count: it says who owes the
// work, not just how much is owed.
//
// Same relative `jsxFixtures` import precedent as compat-pins.test.ts /
// render-divergences.test.ts (see those files' header comments).
//
// The actual logic (domain derivation, tier 1/2 twin verification, the
// per-fixture check) lives in `../escape-coverage.ts`, a plain module
// with no `bun:test` dependency — this file is a thin `describe`/`test`
// wrapper over it. Keeping the logic outside `__tests__` lets it run
// standalone (e.g. against a synthetic adapter that was never registered
// in `adapter-registry.ts`) without pulling in the test runner; that's
// exactly how the additivity claim above was verified concretely — see
// the PR description / task report for the script and its output.

import { describe, test, expect } from 'bun:test'
import { jsxFixtures } from '../../../adapter-tests/fixtures'
import { loadCompatAdapters } from '../adapter-registry'
import {
  computeHonoErrorPinnedFixtures,
  computeDomainFixtureIds,
  evaluateFixtureEscapeCoverage,
  findMisappliedUnescapable,
  findUnescapableMissingIssue,
} from '../escape-coverage'

const { loaded, skipped } = await loadCompatAdapters()
const honoErrorPinnedFixtures = computeHonoErrorPinnedFixtures(loaded)

// The domain below is defined by SUBTRACTION against the reference
// adapter: a fixture hono itself error-pins is a compiler-wide refusal,
// so no adapter owes an escape for it (#2613's boundary). If hono fails
// to import — or its class stops reporting `.name === 'hono'` —
// `computeHonoErrorPinnedFixtures` returns an empty set and that
// subtraction silently becomes a no-op, pulling every compiler-wide
// refusal into the domain. The suite would then fail in bulk for a
// reason that has nothing to do with the escapes being checked.
//
// `compat-pins.test.ts` already asserts `skipped` is empty package-wide,
// so this is not a general load guard — it is specifically about the one
// adapter whose absence changes what this file MEANS rather than merely
// reducing its coverage. Skip reasons are surfaced here anyway, because
// they are the actual diagnosis and reading them in a sibling file's
// output is a detour.
const referenceAdapterProblem = loaded.some(adapter => adapter.id === 'hono')
  ? ''
  : `reference adapter 'hono' is not loaded, so the compiler-wide-refusal subtraction is a no-op and the ` +
    `domain below is too WIDE — any failure naming a fixture the reference itself refuses (today: ` +
    `date-method-uncatalogued) is spurious and will disappear once this is fixed. Failures on other ` +
    `fixtures are still real. ` +
    (skipped.length > 0
      ? `Skipped adapters: ${skipped.map(s => `${s.pkg} (${s.reason})`).join('; ')}`
      : `No adapter was skipped, so @barefootjs/hono loaded but its adapter class no longer reports ` +
        `\`.name === 'hono'\` — loaded ids: ${loaded.map(a => a.id).join(', ')}`)

describe('escape coverage — every adapter refusal is escapable or self-declared unescapable', () => {
  test('reference adapter is loaded (the domain boundary is defined against it)', () => {
    expect(referenceAdapterProblem).toBe('')
  })

  for (const adapter of loaded) {
    describe(adapter.id, () => {
      // Sanity pass over EVERY pin this adapter declares (not just the
      // error-severity domain below): `unescapable` only means something
      // on an error-severity refusal, so a misapplied field elsewhere
      // (e.g. on a 'warning' pin) is a config mistake in the adapter's
      // own package, caught here rather than silently doing nothing.
      test('no "unescapable" declared on a non-error pin', () => {
        expect(findMisappliedUnescapable(adapter)).toEqual([])
      })

      test('every "unescapable" declaration carries an issue URL', () => {
        expect(findUnescapableMissingIssue(adapter)).toEqual([])
      })

      const domainFixtureIds = computeDomainFixtureIds(adapter, honoErrorPinnedFixtures)

      if (domainFixtureIds.length === 0) {
        test('owes no escape (no adapter-specific error pins)', () => {
          expect(domainFixtureIds).toEqual([])
        })
        return
      }

      for (const fixtureId of domainFixtureIds) {
        // `escapeNotOwed` is deliberately costly-by-visibility (#2613):
        // its reason string is folded into the TEST NAME itself, so it
        // shows up in every `bun test` run's output — a reviewer scanning
        // CI output sees the justification, not just a pass/fail dot.
        const notOwedReason = jsxFixtures.find(f => f.id === fixtureId)?.escapeNotOwed?.reason
        const testName = notOwedReason
          ? `[${fixtureId}] escape not owed: ${notOwedReason}`
          : `[${fixtureId}] escapable or self-declared unescapable`

        test(testName, () => {
          const outcome = evaluateFixtureEscapeCoverage(adapter, fixtureId, jsxFixtures)
          if (!outcome.ok) {
            throw new Error(outcome.message)
          }
        })
      }
    })
  }
})
