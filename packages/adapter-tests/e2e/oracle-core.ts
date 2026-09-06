/**
 * Per-fixture oracle bodies (#2481 step 2), extracted unchanged from
 * `oracle.playwright.ts` so `mutation.playwright.ts` can apply the exact
 * same three checks — `'snap'`, `'three-point'`, `'idempotence'` — to a
 * mutated fixture without a second copy of the capture/compare logic. See
 * `oracle.playwright.ts`'s docstring for what each oracle verifies; this
 * module only holds the mechanics, parameterized on `baseUrl` (each
 * Playwright spec owns its own `startFixtureServer` instance, so neither
 * caller can rely on a shared module-level base URL).
 */

import { expect, type Page } from '@playwright/test'
import type { JSXFixture } from '../src/types'
import { fixtureUrl } from './fixture-host'
import { captureDomState, diffDomState, type DomStateSnapshot } from './dom-state'
import { normalizeHTML, stripConditionalMarkersForCrossAdapter } from '../src/html-normalize'
import { actionStepsOf, runStep, type ActionStep } from './interaction-runner'

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
export function canonicalizePortalOriginMarker(html: string): string {
  return html.replace(/bf-po="([A-Z][a-zA-Z]*)_[a-z0-9]+((?:_s\d+)*)"/g, 'bf-po="$1_*$2"')
}

export function normalizeForCompare(html: string): string {
  return canonicalizePortalOriginMarker(stripConditionalMarkersForCrossAdapter(normalizeHTML(html)))
}

/** One animation frame — mirrors `fixture-hydrate.playwright.ts`'s hydration wait. */
export async function waitOneFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(null))))
}

/**
 * Navigate to the fixture's `'deferred'` host (SSR markup, no hydration
 * script yet), capture pre-hydration state, inject the client JS as a
 * real `<script type="module">` (an absolute `/…/__client.js` src — the
 * page's own path is `/<id>/deferred/`, so a relative src would 404),
 * wait a frame, capture post-hydration state.
 */
export async function capturePreAndPostHydration(
  page: Page,
  fixture: JSXFixture,
  baseUrl: string,
): Promise<{ pre: DomStateSnapshot; post: DomStateSnapshot }> {
  await page.goto(fixtureUrl(baseUrl, fixture.id, 'deferred'))
  const pre = await captureDomState(page)
  await page.addScriptTag({ url: `/${fixture.id}/__client.js`, type: 'module' })
  await waitOneFrame(page)
  const post = await captureDomState(page)
  return { pre, post }
}

export async function captureCsrMount(page: Page, fixture: JSXFixture, baseUrl: string): Promise<DomStateSnapshot> {
  await page.goto(fixtureUrl(baseUrl, fixture.id, 'csr-mount'))
  await waitOneFrame(page)
  return captureDomState(page)
}

/**
 * Pin the scroll → frame → action ordering a real user always produces
 * before `step` fires (#2745).
 *
 * Playwright scrolls an action's target into view itself, but it does so
 * in the same task as the pointer event, so whether the page's `scroll`
 * event (dispatched asynchronously, in the next rendering update) is
 * delivered BEFORE or AFTER the action's own handlers run depends on
 * whether a frame boundary happens to land in between — under CI load it
 * sometimes does, locally it mostly doesn't. A component that tracks its
 * anchor on scroll observes the two orderings as different DOM: `select`'s
 * content panel re-reads `getBoundingClientRect` on every `scroll` event
 * while open and stops listening the moment the item click closes it, so
 * its final inline `top`/`--radix-select-content-available-height`
 * differed between the two legs by exactly the scroll-into-view distance
 * (the CSS-less host page grows past the viewport once a selected item's
 * unsized indicator `<svg>` renders, so the second item click has to
 * scroll). Nothing about the construction path is being compared there —
 * only which side of a frame boundary the click fell on.
 *
 * The three waits each close one gap: zero-delay work the previous action
 * deferred (e.g. `select`'s `setTimeout(0)` focus of the selected item,
 * which scrolls) must run before we scroll, or it could scroll again
 * after we do; then the target is scrolled into view explicitly; then one
 * frame delivers that scroll's event so the page has observed it before
 * the action. With the target already visible, Playwright's own
 * scroll-into-view inside the action is a no-op and cannot re-race.
 */
async function settleScrollBeforeAction(page: Page, step: ActionStep, timeout: number): Promise<void> {
  await page.evaluate(() => new Promise(r => setTimeout(r, 0)))
  await page.locator(step.selector).first().scrollIntoViewIfNeeded({ timeout })
  await waitOneFrame(page)
}

/**
 * Load `fixture` under `mode` (`'hydrate'` or `'csr-mount'`, both of
 * which boot the client JS on load — no `addScriptTag` two-step needed
 * here since idempotence only cares about the END state), replay every
 * ACTION step from its `interactions` in order, then capture.
 */
export async function replayActionsAndCapture(
  page: Page,
  fixture: JSXFixture,
  baseUrl: string,
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
    // test outside any `catch`'s reach. See `runStep`'s docstring. The
    // settle's `scrollIntoViewIfNeeded` shares the bound and fails first
    // on an absent selector, so a missing element still costs one 5s
    // wait per leg, not two.
    await settleScrollBeforeAction(page, step, 5_000)
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
export function assertSnapshotsAgree(label: string, a: DomStateSnapshot, b: DomStateSnapshot): void {
  const normA = normalizeForCompare(a.html)
  const normB = normalizeForCompare(b.html)
  expect(normA, `${label}: structural HTML diverges`).toBe(normB)
  const stateDiff = diffDomState(a, b)
  expect(stateDiff, `${label}: DOM state diverges:\n${stateDiff.join('\n')}`).toEqual([])
}

/** `'snap'` oracle body: hydration must be a no-op on visible SSR state. */
export async function runSnapOracle(page: Page, fixture: JSXFixture, baseUrl: string): Promise<void> {
  const { pre, post } = await capturePreAndPostHydration(page, fixture, baseUrl)
  assertSnapshotsAgree(`${fixture.id} (SSR vs hydrated)`, pre, post)
}

/** `'three-point'` oracle body: SSR ≡ hydrated ≡ csr-mount. */
export async function runThreePointOracle(page: Page, fixture: JSXFixture, baseUrl: string): Promise<void> {
  const { pre, post } = await capturePreAndPostHydration(page, fixture, baseUrl)
  assertSnapshotsAgree(`${fixture.id} (SSR vs hydrated)`, pre, post)
  const csr = await captureCsrMount(page, fixture, baseUrl)
  assertSnapshotsAgree(`${fixture.id} (hydrated vs csr-mount)`, post, csr)
}

/** `'idempotence'` oracle body: replayed actions agree between hydrated and csr-mount. */
export async function runIdempotenceOracle(page: Page, fixture: JSXFixture, baseUrl: string): Promise<void> {
  const hydratedFinal = await replayActionsAndCapture(page, fixture, baseUrl, 'hydrate')
  const csrFinal = await replayActionsAndCapture(page, fixture, baseUrl, 'csr-mount')
  assertSnapshotsAgree(`${fixture.id} (hydrated actions vs csr-mount actions)`, hydratedFinal, csrFinal)
}
