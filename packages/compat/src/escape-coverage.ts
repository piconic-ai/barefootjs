// Pure logic for the "loud-or-escapable" floor (#2613). Lives outside
// `__tests__` (unlike its sibling `escape-coverage.test.ts`, which wraps
// these functions in `describe`/`test`) so it can be exercised as a plain
// module — by the floor test itself, and by ad-hoc verification that
// doesn't want to pull in `bun:test`'s runner (e.g. proving these
// functions behave correctly against a synthetic adapter that was never
// registered in `adapter-registry.ts`).
//
// See `escape-coverage.test.ts`'s header comment for the full design
// rationale (domain, tiers, cost ordering, why `unescapable` lives on
// `ConformancePin` rather than in a central ledger).

import type { JSXFixture } from '../../adapter-tests/src/types'
import { CSR_SKIP_FIXTURES } from '../../adapter-tests/src/csr-skip-set'
import type { LoadedCompatAdapter } from './adapter-registry'
import { compileForCompat } from './engine'

/**
 * Fixtures the reference adapter (hono) itself error-pins — a
 * compiler-wide refusal, never adapter-specific, so no adapter/fixture
 * pair naming one of these owes an escape. Today this is exactly
 * `date-method-uncatalogued` (BF021, #2356): a host rich-typed method
 * call with no catalogued lowering, refused by `checkRichTypeMethodCalls`
 * ahead of `adapter.generate()` — even Hono's native JS evaluation never
 * reaches the call.
 *
 * `hono` names the architecturally fixed reference adapter (the same
 * special-casing `report.ts` / `support-matrix.ts` already do for column
 * ordering), not a per-fixture debt declaration.
 */
export function computeHonoErrorPinnedFixtures(loadedAdapters: readonly LoadedCompatAdapter[]): Set<string> {
  const honoAdapter = loadedAdapters.find(a => a.id === 'hono')
  return new Set(
    honoAdapter
      ? Object.entries(honoAdapter.pins)
          .filter(([, pins]) => pins.some(p => p.severity === 'error'))
          .map(([fixtureId]) => fixtureId)
      : [],
  )
}

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
export function twinWorksOnAdapter(twin: JSXFixture, adapter: LoadedCompatAdapter): boolean {
  const instance = adapter.factory()
  const errors = compileForCompat(twin.source, 'component.tsx', instance, 'conformance', twin.components)
  const tier1Clean = !errors.some(e => e.severity === 'error')
  const tier2Unpinned = !(twin.id in adapter.pins)
  const tier2NonDivergent = !(twin.id in adapter.renderDivergences)
  const tier2NotCsrSkipped = !CSR_SKIP_FIXTURES.has(twin.id)
  return tier1Clean && tier2Unpinned && tier2NonDivergent && tier2NotCsrSkipped
}

/** Every `fixtureId` this adapter owes an escape for (error-pinned here, not error-pinned on the reference). */
export function computeDomainFixtureIds(adapter: LoadedCompatAdapter, honoErrorPinned: ReadonlySet<string>): string[] {
  return Object.entries(adapter.pins)
    .filter(([fixtureId, pins]) => pins.some(p => p.severity === 'error') && !honoErrorPinned.has(fixtureId))
    .map(([fixtureId]) => fixtureId)
}

export interface EscapeCoverageOutcome {
  ok: boolean
  message?: string
}

/**
 * The single check every domain pair must pass: `escapeNotOwed` on the
 * fixture (no escape owed, by design), a verified `escapes` twin, or the
 * adapter's own error pin declaring `unescapable`. Pure function (no
 * `expect`/`throw`) so it can run outside `bun:test`.
 */
export function evaluateFixtureEscapeCoverage(
  adapter: LoadedCompatAdapter,
  fixtureId: string,
  fixtures: readonly JSXFixture[],
): EscapeCoverageOutcome {
  const fixture = fixtures.find(f => f.id === fixtureId)
  if (!fixture) {
    return {
      ok: false,
      message: `stale pin: adapter '${adapter.id}' error-pins fixture '${fixtureId}', which does not exist in jsxFixtures`,
    }
  }

  // The test path always derives `fixtureId` from `adapter.pins` (see
  // `computeDomainFixtureIds`), so this is unreachable there — but this
  // function is exported for standalone use against synthetic adapters,
  // where a caller can pass any id. Returning an outcome rather than
  // dereferencing `undefined` keeps the "no throw" promise above true
  // for every caller, not just the in-repo one.
  const pinsForFixture = adapter.pins[fixtureId]
  if (!pinsForFixture) {
    return {
      ok: false,
      message: `adapter '${adapter.id}' declares no pins for fixture '${fixtureId}' — evaluateFixtureEscapeCoverage expects a fixture this adapter actually pins (domain ids come from computeDomainFixtureIds)`,
    }
  }

  const errorPins = pinsForFixture.filter(p => p.severity === 'error')
  const unescapablePin = errorPins.find(p => p.unescapable)

  if (fixture.escapeNotOwed) {
    if (!fixture.escapeNotOwed.reason || fixture.escapeNotOwed.reason.trim().length === 0) {
      return {
        ok: false,
        message: `[${fixtureId}] declares 'escapeNotOwed' with an empty reason — a non-empty prose justification is required (EscapeNotOwed, packages/adapter-tests/src/types.ts).`,
      }
    }
    if (unescapablePin) {
      return {
        ok: false,
        message:
          `[${adapter.id}/${fixtureId}] is declared BOTH 'escapeNotOwed' on the fixture AND 'unescapable' ` +
          `on the '${unescapablePin.code}' pin in ${adapter.pkg}'s own conformance-pins.ts — pick one. ` +
          `'escapeNotOwed' means "no escape is owed, by design"; 'unescapable' means "an escape is owed ` +
          `but not authored yet". They are mutually exclusive.`,
      }
    }
    // Escape genuinely not owed, by design, with a reviewed reason: satisfied.
    return { ok: true }
  }

  const declaredEscapes = fixture.escapes ?? []
  let workingTwinId: string | undefined
  for (const escape of declaredEscapes) {
    const twin = fixtures.find(f => f.id === escape.fixture)
    if (!twin) {
      return {
        ok: false,
        message: `stale twin: fixture '${fixtureId}' declares an escape twin '${escape.fixture}', which does not exist in jsxFixtures`,
      }
    }
    if (twinWorksOnAdapter(twin, adapter)) {
      workingTwinId = twin.id
      break
    }
  }

  if (unescapablePin) {
    if (workingTwinId) {
      return {
        ok: false,
        message:
          `stale 'unescapable' on the '${unescapablePin.code}' pin for '${fixtureId}' on '${adapter.id}': ` +
          `a working escape twin ('${workingTwinId}') now exists here — remove 'unescapable' from that ` +
          `pin in ${adapter.pkg}'s own conformance-pins.ts (escape-coverage.test.ts).`,
      }
    }
    // Self-declared unescapable and still no working twin: expected.
    return { ok: true }
  }

  if (!workingTwinId) {
    return {
      ok: false,
      message:
        `[${adapter.id}/${fixtureId}] refused with an error-severity pin but has no verified escape.\n\n` +
        `FAST PATH: add 'unescapable: { issue: '<url>' }' to the error pin for '${fixtureId}' in ` +
        `${adapter.pkg}'s own conformance-pins.ts (point at #2613 if no more specific issue exists yet) ` +
        `— this is the intended way to unblock landing the pin, not a stopgap.\n\n` +
        `Only author an escape fixture (declare 'escapes' on '${fixtureId}' pointing at a twin that ` +
        `compiles clean, is unpinned, non-divergent, and not CSR-skipped on '${adapter.id}') if you ` +
        `actually want to close this gap now.`,
    }
  }

  return { ok: true }
}

/**
 * The three states a refused fixture's escape story can be in on ONE
 * adapter (#2613's "escape visibility" follow-up) — the rendering-side
 * counterpart of the `escapable or self-declared unescapable` floor test
 * above, not a new judgement:
 *
 *   - `'escapable'` — the fixture names an `escapes` twin and it actually
 *     works HERE (`twinWorksOnAdapter`, same tier-1/tier-2 check the floor
 *     test itself uses). `twin` is which declared twin fixture it was, so
 *     a renderer can link straight to the demonstration.
 *   - `'debt'` — refused, no working escape, and the adapter's own pin
 *     says so (`unescapable: { issue }`) — tracked, not silent.
 *   - `'not-owed'` — the fixture itself declares `escapeNotOwed`: no
 *     escape will ever be authored here, by design. `reason` is the
 *     fixture's own prose justification, carried through so a renderer
 *     doesn't have to re-derive or truncate it.
 */
export type FixtureEscapeState =
  | { state: 'escapable'; twin: string }
  | { state: 'debt' }
  | { state: 'not-owed'; reason: string }

/**
 * Classify ONE `(adapter, fixtureId)` refusal cell for rendering. Callers
 * MUST only invoke this for a pair already confirmed in-domain (an
 * error-severity pin on `adapter`, and `fixtureId` not in
 * `computeHonoErrorPinnedFixtures(...)`'s result) — see
 * `buildFixtureDivergences` in `./report.ts`, the sole caller. Outside
 * that domain `evaluateFixtureEscapeCoverage` may legitimately report
 * `ok: false` for reasons that have nothing to do with THIS adapter (e.g.
 * a compiler-wide refusal nobody bothers to annotate), which would make
 * the throw below fire spuriously.
 *
 * Deliberately re-derives nothing `evaluateFixtureEscapeCoverage` already
 * decided — it's called first, and a non-ok outcome throws rather than
 * guessing a state, because reaching that branch on a landed pin means
 * the "loud-or-escapable" floor test (`escape-coverage.test.ts`) would
 * itself be RED: the lock is being regenerated against broken/uncommitted
 * pin state, and a docs page silently rendering a stale guess would hide
 * that. The classification below only picks which of the three already-
 * proven-consistent branches applies, using the exact same declarative
 * fields (`escapeNotOwed`, `unescapable`, `escapes` + `twinWorksOnAdapter`)
 * the floor test itself reads — never a parallel judgement.
 */
export function classifyFixtureEscapeState(
  adapter: LoadedCompatAdapter,
  fixtureId: string,
  fixtures: readonly JSXFixture[],
): FixtureEscapeState {
  const outcome = evaluateFixtureEscapeCoverage(adapter, fixtureId, fixtures)
  if (!outcome.ok) {
    throw new Error(
      `compat-matrix render: escape-coverage floor test would fail for [${adapter.id}/${fixtureId}] — fix ` +
        `the pin/twin declaration and re-run 'bun test packages/compat/src/__tests__/escape-coverage.test.ts' ` +
        `before regenerating the lock:\n${outcome.message}`,
    )
  }

  const fixture = fixtures.find(f => f.id === fixtureId)!
  if (fixture.escapeNotOwed) {
    return { state: 'not-owed', reason: fixture.escapeNotOwed.reason }
  }

  const pinsForFixture = adapter.pins[fixtureId] ?? []
  if (pinsForFixture.some(p => p.severity === 'error' && p.unescapable)) {
    return { state: 'debt' }
  }

  for (const escape of fixture.escapes ?? []) {
    const twin = fixtures.find(f => f.id === escape.fixture)
    if (twin && twinWorksOnAdapter(twin, adapter)) {
      return { state: 'escapable', twin: twin.id }
    }
  }

  // `evaluateFixtureEscapeCoverage` only returns `ok: true` via one of the
  // three branches above (escapeNotOwed / unescapable / a working twin), so
  // this is structurally unreachable given the guard already passed — kept
  // as a defensive `'debt'` rather than a non-null assertion so a future
  // change to that function's branches fails safe (a docs page rendering
  // "no escape yet" for a really-fine case) rather than throwing.
  return { state: 'debt' }
}

/**
 * Every pin-config mistake `escapes-coverage.test.ts` guards against
 * beyond the domain check itself: `unescapable` set on a non-error pin
 * (meaningless — only an error-severity refusal owes an escape), or set
 * with no tracking issue (breaks the "every unescapable carries an
 * issue-URL" discipline `KNOWN_HOLES` established).
 */
export function findMisappliedUnescapable(adapter: LoadedCompatAdapter): string[] {
  return Object.entries(adapter.pins).flatMap(([fixtureId, pins]) =>
    pins.filter(p => p.unescapable && p.severity !== 'error').map(p => `${fixtureId} (${p.severity}/${p.code})`),
  )
}

export function findUnescapableMissingIssue(adapter: LoadedCompatAdapter): string[] {
  return Object.entries(adapter.pins).flatMap(([fixtureId, pins]) =>
    pins.filter(p => p.unescapable && !p.unescapable.issue).map(p => `${fixtureId} (${p.code})`),
  )
}
