/**
 * Fixture-driven real-browser hydration tests (#1467).
 *
 * For each fixture that ships an `expectedHtml` + `expectedClientJs` +
 * `interactions` triple, this spec:
 *   1. Spins up a minimal `node:http` server that serves a host page
 *      whose body contains `expectedHtml` and whose
 *      `<script type="module">` imports `expectedClientJs`.
 *   2. Resolves `@barefootjs/client/runtime` via an import-map pointing at
 *      the prebuilt `packages/client/dist/runtime/standalone.js` so the
 *      compiler output runs unmodified — the same module graph used by
 *      `bf build` consumers.
 *   3. Drives `interactions` through Playwright, asserting DOM state.
 *
 * When a step fails: the input HTML and client JS were known-good (frozen
 * by `scripts/snapshot-*.ts`). That narrows blame to the runtime in
 * `packages/client/src/runtime/` or a real-browser semantic happy-dom
 * doesn't model, exactly the responsibility split #1467 describes.
 *
 * Prerequisite: `@barefootjs/client` must be built (`bun run --filter
 * '@barefootjs/client' build`) before this suite runs — the standalone
 * runtime bundle is the import target the host page resolves at runtime.
 * CI's `Build packages` step already covers this; locally, `bun run
 * build` from the repo root is enough.
 *
 * Host/server construction lives in `./fixture-host.ts` and step dispatch
 * in `./interaction-runner.ts` (#2481) — both shared with
 * `oracle.playwright.ts`, which compares this same fixture corpus rendered
 * three different ways instead of against a hand-authored expectation.
 *
 * A fixture whose `interactions` describe the CORRECT behavior but whose
 * compiler output doesn't deliver it yet (a `silent` known limitation,
 * landed as a fixture per CLAUDE.md's "a reproducible defect lands as a
 * fixture" rule) is quarantined in `./fixture-hydrate-quarantine.ts`
 * instead of being required to pass — see that file's docstring for the
 * rot-check discipline `runQuarantined` below enforces.
 */

import { test } from '@playwright/test'
import type { Server } from 'node:http'
import { loadAllSharedFixtures } from '../fixtures/_helpers'
import type { JSXFixture } from '../src/types'
import { startFixtureServer, fixtureUrl } from './fixture-host'
import { runStep } from './interaction-runner'
import { FIXTURE_HYDRATE_QUARANTINE } from './fixture-hydrate-quarantine'

let server: Server
let baseUrl: string

// Top-level await: discover every shared-component fixture by
// directory convention. Adding a new fixture file is now zero-touch
// for this spec — drop the file under `../fixtures/`, regenerate its
// snapshot via `scripts/snapshot.ts`, and it shows up here on the
// next test run.
const fixtures: JSXFixture[] = await loadAllSharedFixtures()

test.beforeAll(async () => {
  // Host page construction and the `node:http` server itself live in
  // `./fixture-host.ts` (#2481) — shared with `oracle.playwright.ts`,
  // which additionally needs the `'deferred'` / `'csr-mount'` host
  // shapes. This suite only ever asks for the default `'hydrate'` mode,
  // so its behavior is unchanged.
  ;({ server, baseUrl } = await startFixtureServer(fixtures))
})

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

/**
 * Run the fixture's `interactions` under `FIXTURE_HYDRATE_QUARANTINE`'s
 * rot-check discipline (see that file's docstring, and
 * `oracle.playwright.ts`'s `runQuarantined`, the precedent this mirrors):
 * a quarantined fixture is expected to still FAIL its interactions — if
 * it unexpectedly passes, that IS the test failure (a "stale — delete the
 * entry" message), not a silent green. An unquarantined fixture just runs
 * `assertion` normally.
 */
async function runQuarantined(id: string, assertion: () => Promise<void>): Promise<void> {
  const entry = FIXTURE_HYDRATE_QUARANTINE[id]
  if (!entry) {
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
      `fixture-hydrate-quarantine.ts entry for [${id}] is stale — the fixture now passes its interactions; ` +
        `delete the entry (and the fixture graduates into a plain regression test).`,
    )
  }
}

for (const fixture of fixtures) {
  if (!fixture.interactions || !fixture.expectedHtml || !fixture.expectedClientJs) {
    continue
  }
  test(`${fixture.id} hydrates and reacts to interactions`, async ({ page }, info) => {
    const browserLogs: string[] = []
    page.on('console', msg => browserLogs.push(`${msg.type()}: ${msg.text()}`))
    page.on('pageerror', err => browserLogs.push(`pageerror: ${err.message}`))
    await page.goto(fixtureUrl(baseUrl, fixture.id))
    // Hydration is microtask + rAF on the runtime side. A single rAF wait
    // covers both — we don't need to expose flushHydration just for tests.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(null))))
    // Only attach browser logs on failure — green runs would otherwise
    // bloat Playwright artifacts as the corpus grows.
    let failed = false
    try {
      await runQuarantined(fixture.id, async () => {
        for (const step of fixture.interactions!) {
          await runStep(page, step)
        }
      })
    } catch (err) {
      failed = true
      throw err
    } finally {
      if (failed && browserLogs.length > 0) {
        await info.attach('browser-logs.txt', {
          body: browserLogs.join('\n'),
          contentType: 'text/plain',
        })
      }
    }
  })
}
