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
 *   - **`'idempotence'`** — added in a later commit of this PR: replays a
 *     fixture's interaction *actions* against both the hydrated and the
 *     csr-mount legs and compares the resulting state.
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

function normalizeForCompare(html: string): string {
  return stripConditionalMarkersForCrossAdapter(normalizeHTML(html))
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
}
