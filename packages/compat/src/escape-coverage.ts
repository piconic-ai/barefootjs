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

  const errorPins = adapter.pins[fixtureId].filter(p => p.severity === 'error')
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
