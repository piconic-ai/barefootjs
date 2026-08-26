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
 * `expectedHtml` + `expectedClientJs` pair (37 as of #2481, regardless of
 * whether the fixture also has `interactions` — `'snap'`/`'three-point'`
 * don't need any). A fixture/oracle pair known to currently diverge is
 * quarantined in `oracle-quarantine.ts` rather than skipped — see that
 * file's docstring for the rot-check discipline this suite enforces on
 * every quarantined pair.
 */

import { test, expect } from '@playwright/test'
import type { Server } from 'node:http'
import { loadAllSharedFixtures } from '../fixtures/_helpers'
import type { JSXFixture } from '../src/types'
import { startFixtureServer, fixtureUrl } from './fixture-host'
import { captureDomState, diffDomState, type DomStateSnapshot } from './dom-state'
// From `html-normalize.ts`, NOT `jsx-runner.ts`: that module imports
// `bun:test` at the top level, which Node's `worker_threads` loader (what
// Playwright workers run under, even though the top-level `bunx
// playwright` invocation runs under Bun) can't resolve. See
// `html-normalize.ts`'s docstring.
import { normalizeHTML, stripConditionalMarkersForCrossAdapter } from '../src/html-normalize'
import { ORACLE_QUARANTINE, type OracleKind } from './oracle-quarantine'
import { actionStepsOf, runStep } from './interaction-runner'

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
 * the current 37 shared fixtures need this (their props already cross
 * the SSR `bf-p` JSON boundary, which demands the same domain), but a
 * future fixture with e.g. a function prop would need it.
 */
const CSR_MOUNT_EXCLUDED: ReadonlyMap<string, string> = new Map([])

/**
 * Fixtures excluded from the `'idempotence'` oracle, by declared id, with
 * a reason. Reserved for a fixture whose action steps are inherently
 * position/timing-dependent enough to be flaky when the SAME sequence
 * runs twice for comparison, independent of any real idempotence bug —
 * `carousel`'s `drag` step is the only current member (see the
 * determinism caveat already documented on `InteractionStep`'s `'drag'`
 * variant, `src/types.ts`, and #1971).
 */
const IDEMPOTENCE_EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    'carousel',
    "drag steps are pointer-position-dependent on a CSS-less host page (src/types.ts's 'drag' variant docstring, #1971) — replaying the same drag twice for comparison would be flaky independent of any real idempotence bug.",
  ],
])

/**
 * Canonicalize `bf-po` (portal-origin marker) the same way `normalizeHTML`
 * already canonicalizes `bf-s`: `Name_<randomhash>(_sN)*` → `Name_*(_sN)*`.
 * `bf-po` carries the SAME non-deterministic-hash shape `bf-s` does (it's
 * a portal's own scope id, stamped on the SSR placeholder for hydration
 * reconciliation — see the dialog/popover/dropdown-menu/portal fixtures),
 * but `normalizeHTML` (`html-normalize.ts`) doesn't know about it: every
 * OTHER adapter-conformance/CSR-conformance consumer of that shared
 * function compares SSR output against SSR output, where every render
 * shares one fixed `__instanceId` root and `bf-po` is consequently
 * byte-identical across sides — nothing ever needed this rule before.
 * This oracle is the first consumer that compares two INDEPENDENTLY
 * hydrated/mounted trees (each getting its own random portal scope id),
 * so it layers this extra canonicalization on top locally rather than
 * widening the shared cross-adapter function for one caller.
 */
function canonicalizePortalOriginMarker(html: string): string {
  return html.replace(/bf-po="([A-Z][a-zA-Z]*)_[a-z0-9]+((?:_s\d+)*)"/g, 'bf-po="$1_*$2"')
}

function normalizeForCompare(html: string): string {
  return canonicalizePortalOriginMarker(stripConditionalMarkersForCrossAdapter(normalizeHTML(html)))
}

/** One animation frame — mirrors `fixture-hydrate.playwright.ts`'s hydration wait. */
async function waitOneFrame(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(null))))
}

/**
 * Navigate to the fixture's `'deferred'` host (SSR markup, no hydration
 * script yet), capture pre-hydration state, inject the client JS as a
 * real `<script type="module">` (an absolute `/…/__client.js` src — the
 * page's own path is `/<id>/deferred/`, so a relative src would 404),
 * wait a frame, capture post-hydration state.
 */
async function capturePreAndPostHydration(
  page: import('@playwright/test').Page,
  fixture: JSXFixture,
): Promise<{ pre: DomStateSnapshot; post: DomStateSnapshot }> {
  await page.goto(fixtureUrl(baseUrl, fixture.id, 'deferred'))
  const pre = await captureDomState(page)
  await page.addScriptTag({ url: `/${fixture.id}/__client.js`, type: 'module' })
  await waitOneFrame(page)
  const post = await captureDomState(page)
  return { pre, post }
}

async function captureCsrMount(
  page: import('@playwright/test').Page,
  fixture: JSXFixture,
): Promise<DomStateSnapshot> {
  await page.goto(fixtureUrl(baseUrl, fixture.id, 'csr-mount'))
  await waitOneFrame(page)
  return captureDomState(page)
}

/**
 * Load `fixture` under `mode` (`'hydrate'` or `'csr-mount'`, both of
 * which boot the client JS on load — no `addScriptTag` two-step needed
 * here since idempotence only cares about the END state), replay every
 * ACTION step from its `interactions` in order, then capture.
 */
async function replayActionsAndCapture(
  page: import('@playwright/test').Page,
  fixture: JSXFixture,
  mode: 'hydrate' | 'csr-mount',
): Promise<DomStateSnapshot> {
  await page.goto(fixtureUrl(baseUrl, fixture.id, mode))
  await waitOneFrame(page)
  for (const step of actionStepsOf(fixture.interactions)) {
    // Bounded well under the test's own (extended, see the `idempotence`
    // test below) timeout: a selector genuinely absent in one leg — a
    // real divergence, not a flake — must fail fast enough for
    // `runQuarantined`'s plain `try`/`catch` to observe it, rather than
    // hang until Playwright's outer per-test timeout force-cancels the
    // test outside any `catch`'s reach. See `runStep`'s docstring.
    await runStep(page, step, { timeout: 5_000 })
  }
  return captureDomState(page)
}

/**
 * Assert two captures agree: normalized structural HTML plus the full
 * DOM-state property table. Throws with a combined, human-readable
 * message on the first disagreement (structural mismatch takes priority
 * — a state-table diff on top of already-divergent HTML is noise).
 */
function assertSnapshotsAgree(label: string, a: DomStateSnapshot, b: DomStateSnapshot): void {
  const normA = normalizeForCompare(a.html)
  const normB = normalizeForCompare(b.html)
  expect(normA, `${label}: structural HTML diverges`).toBe(normB)
  const stateDiff = diffDomState(a, b)
  expect(stateDiff, `${label}: DOM state diverges:\n${stateDiff.join('\n')}`).toEqual([])
}

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
    await runQuarantined(fixture.id, 'snap', async () => {
      const { pre, post } = await capturePreAndPostHydration(page, fixture)
      assertSnapshotsAgree(`${fixture.id} (SSR vs hydrated)`, pre, post)
    })
  })

  const csrExcludeReason = CSR_MOUNT_EXCLUDED.get(fixture.id)
  test(`[three-point] ${fixture.id}: SSR ≡ hydrated ≡ csr-mount`, async ({ page }) => {
    test.skip(!!csrExcludeReason, csrExcludeReason)
    await runQuarantined(fixture.id, 'three-point', async () => {
      const { pre, post } = await capturePreAndPostHydration(page, fixture)
      assertSnapshotsAgree(`${fixture.id} (SSR vs hydrated)`, pre, post)
      const csr = await captureCsrMount(page, fixture)
      assertSnapshotsAgree(`${fixture.id} (hydrated vs csr-mount)`, post, csr)
    })
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
    await runQuarantined(fixture.id, 'idempotence', async () => {
      const hydratedFinal = await replayActionsAndCapture(page, fixture, 'hydrate')
      const csrFinal = await replayActionsAndCapture(page, fixture, 'csr-mount')
      assertSnapshotsAgree(`${fixture.id} (hydrated actions vs csr-mount actions)`, hydratedFinal, csrFinal)
    })
  })
}
