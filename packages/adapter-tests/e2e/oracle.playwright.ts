/**
 * Oracle conformance suite (#2481 step 1 — "オラクルハーネス").
 *
 * `fixture-hydrate.playwright.ts` proves one thing per fixture: SSR HTML
 * + frozen client JS hydrates and reacts to a scripted interaction
 * sequence. It never asks whether that same fixture, rendered a
 * *different* way, produces the same result — which is exactly the class
 * of bug a hydration mismatch or a CSR-only code path introduces
 * silently. This suite adds three independent oracles that each compare
 * two or three renders of the SAME fixture against each other instead of
 * against a hand-authored expectation:
 *
 *   - **`'snap'`** — hydration must be a no-op on visible state. Capture
 *     DOM state right after the server-rendered host page loads
 *     (`'deferred'` mode, before the hydration script runs), inject the
 *     client JS, wait one animation frame, capture again. The two
 *     captures — structural HTML (normalized) and the live property
 *     table from `dom-state.ts` — must be identical.
 *   - **`'three-point'`** — SSR ≡ hydrated ≡ client-side-mounted. Extends
 *     `'snap'`'s pre/post-hydration pair with a THIRD, independently
 *     produced render: `'csr-mount'` mode boots the same client JS with
 *     no SSR input at all, calling the real
 *     `createComponent(name, props)` from `@barefootjs/client/runtime`
 *     (not the Bun-side mock `csr-render.ts` uses) and mounting the
 *     result into an empty body. All three must agree.
 *   - **`'idempotence'`** — same end state regardless of construction
 *     path. Extracts only the ACTION steps (`click`/`fill`/`hover`/
 *     `press`/`drag`) from a fixture's `interactions` — never the
 *     `expect*` assertion steps, which `fixture-hydrate.playwright.ts`
 *     already owns — and replays that action sequence against a fresh
 *     `'hydrate'`-mode page and a fresh `'csr-mount'`-mode page. The
 *     final DOM states must agree: whatever a click/fill/drag changes
 *     should not depend on whether the component got there via hydration
 *     or a from-scratch client mount.
 *
 * Every oracle test is generated for every fixture that carries the
 * `expectedHtml` + `expectedClientJs` pair (41 as of #2481, regardless of
 * whether the fixture also has `interactions` — `'snap'`/`'three-point'`
 * don't need any). A fixture/oracle pair known to currently diverge is
 * quarantined in `oracle-quarantine.ts` rather than skipped — see that
 * file's docstring for the rot-check discipline this suite enforces on
 * every quarantined pair.
 */

import { test } from '@playwright/test'
import type { Server } from 'node:http'
import { loadAllSharedFixtures } from '../fixtures/_helpers'
import type { JSXFixture } from '../src/types'
import { startFixtureServer } from './fixture-host'
import { ORACLE_QUARANTINE, type OracleKind } from './oracle-quarantine'
import { actionStepsOf } from './interaction-runner'
import { runIdempotenceOracle, runSnapOracle, runThreePointOracle } from './oracle-core'

let server: Server
let baseUrl: string

const fixtures: JSXFixture[] = await loadAllSharedFixtures()

// Oracle-1/2 target set: every fixture carrying the frozen SSR HTML +
// client JS pair. Unlike `fixture-hydrate.playwright.ts`'s loop this does
// NOT require `interactions` — `kbd`/`label` ship none (by design, to
// cover that suite's skip path) but still have real markup + hydration
// behavior these structural/state oracles can compare.
const oracleFixtures = fixtures.filter(f => f.expectedHtml && f.expectedClientJs)

/**
 * Fixtures excluded from the `'csr-mount'` leg (and therefore from
 * `'three-point'`), by declared id, with a reason. Reserved for a
 * fixture whose `props` can't survive the JSON round-trip
 * `fixture-host.ts`'s csr-mount boot script embeds them with — none of
 * the current shared fixtures need this (their props already cross
 * the SSR `bf-p` JSON boundary, which demands the same domain), but a
 * future fixture with e.g. a function prop would need it.
 */
const CSR_MOUNT_EXCLUDED: ReadonlyMap<string, string> = new Map([])

/**
 * Fixtures excluded from the `'idempotence'` oracle, by declared id, with
 * a reason. Reserved for a fixture whose comparison is inherently flaky
 * independent of any real idempotence bug — either because its action
 * steps are position/timing-dependent (`carousel`'s `drag` step, see the
 * determinism caveat already documented on `InteractionStep`'s `'drag'`
 * variant, `src/types.ts`, and #1971), or because the comparison itself
 * is bimodal (`command`, #2827) — the quarantine ledger can't express
 * "reliably fails" for a pair that isn't.
 */
const IDEMPOTENCE_EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    'carousel',
    "drag steps are pointer-position-dependent on a CSS-less host page (src/types.ts's 'drag' variant docstring, #1971) — replaying the same drag twice for comparison would be flaky independent of any real idempotence bug.",
  ],
  [
    'command',
    'measured non-deterministic (#2827): replaying the fill/filter steps twice for comparison lands on a differently-structured filtered list some of the time and agrees the rest — a race in the runtime\'s own filtered-list reconciliation, not a timing artifact of the interaction harness. Quarantining it assumes a reliably-failing pair, which this is not (CI has observed both the structural-divergence failure and the ledger\'s stale-entry rot-check tripping on the same pair).',
  ],
  [
    'combobox',
    'measured bimodal once its portal-ordering divergence was fixed (#2717): 4 of 5 repeats agree, the fifth diverges only on the `combobox-empty` row\'s `hidden` attribute (its visibility is an effect counting visible siblings after the fill/filter steps) — the same filtered-list reconciliation race class as `command` (#2827), not a portal-position difference (the portaled content sits at the same body position on every run). The ledger\'s "reliably fails" assumption does not hold for this pair, so it is excluded rather than quarantined.',
  ],
])

test.beforeAll(async () => {
  ;({ server, baseUrl } = await startFixtureServer(fixtures))
})

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

/**
 * Run `assertion` under the quarantine ledger's rot-check discipline
 * (`oracle-quarantine.ts`'s docstring): a quarantined `[id, oracle]` pair
 * is expected to still fail `assertion` — if it unexpectedly passes, that
 * IS the test failure (a "stale — delete the entry" message), not a
 * silent green. An unquarantined pair just runs `assertion` normally.
 */
async function runQuarantined(id: string, oracle: OracleKind, assertion: () => Promise<void>): Promise<void> {
  const entry = ORACLE_QUARANTINE[id]
  const quarantined = !!entry && entry.oracles.includes(oracle)
  if (!quarantined) {
    await assertion()
    return
  }
  let failure: unknown
  try {
    await assertion()
  } catch (err) {
    failure = err
  }
  if (failure === undefined) {
    throw new Error(
      `oracle-quarantine.ts entry for [${id}]/'${oracle}' is stale — the fixture now passes this oracle; ` +
        `delete the entry (and close/update its tracking issue: ${entry?.issue ?? '<none filed yet>'}).`,
    )
  }
}

for (const fixture of oracleFixtures) {
  test(`[snap] ${fixture.id}: hydration is a no-op on SSR state`, async ({ page }) => {
    await runQuarantined(fixture.id, 'snap', () => runSnapOracle(page, fixture, baseUrl))
  })

  const csrExcludeReason = CSR_MOUNT_EXCLUDED.get(fixture.id)
  test(`[three-point] ${fixture.id}: SSR ≡ hydrated ≡ csr-mount`, async ({ page }) => {
    test.skip(!!csrExcludeReason, csrExcludeReason)
    await runQuarantined(fixture.id, 'three-point', () => runThreePointOracle(page, fixture, baseUrl))
  })

  const actions = actionStepsOf(fixture.interactions)
  if (actions.length === 0) {
    // `kbd`/`label` ship no `interactions` at all (by design — see
    // `fixture-hydrate.playwright.ts`'s skip-path coverage); nothing to
    // replay, so this fixture gets no idempotence test.
    continue
  }
  const idempotenceExcludeReason = IDEMPOTENCE_EXCLUDED.get(fixture.id)
  test(`[idempotence] ${fixture.id}: replayed actions agree between hydrated and csr-mount`, async ({ page }) => {
    test.skip(!!idempotenceExcludeReason, idempotenceExcludeReason)
    // Two legs, each replaying up to a handful of 5s-bounded actions
    // (`replayActionsAndCapture`) — the default 10s test timeout doesn't
    // leave headroom for a quarantined fixture's actions to fail-fast on
    // BOTH legs and still let `runQuarantined` observe the rejection.
    test.setTimeout(30_000)
    await runQuarantined(fixture.id, 'idempotence', () => runIdempotenceOracle(page, fixture, baseUrl))
  })
}
