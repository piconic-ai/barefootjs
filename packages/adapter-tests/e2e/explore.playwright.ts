/**
 * Bounded state-space exploration suite (#3046).
 *
 * `scripts/explore-generate.ts` enumerates, for each scenario in
 * `explore/scenarios`, every action sequence up to the scenario's depth
 * bound and renders one fresh fixture per distinct reachable state into
 * `.explore/` (gitignored). This suite hosts those fixtures through the
 * same `fixture-host.ts` server every other e2e suite uses and asks two
 * kinds of question:
 *
 *   PER STATE — the existing `snap` and `three-point` oracles
 *   (`oracle-core.ts`) against that state's fresh render, exactly as
 *   `pairwise.playwright.ts` runs them. Free coverage: a state the
 *   corpus never renders from scratch (a keyed loop at length 0 or 3)
 *   gets the SSR ≡ hydrated ≡ csr-mount check for nothing.
 *
 *   PER PATH — the transition oracle, the proposal's primary invariant:
 *
 *       DOM(initial = S0, then click a1 … an)
 *         == DOM(initial = reduce*(S0, a1 … an), rendered fresh)
 *
 *   run on two legs so a failure is attributable. `transition-hydrate`
 *   compares an SSR+hydrated page driven through the clicks against an
 *   SSR+hydrated fresh render of the end state (the production path);
 *   `transition-csr` compares a csr-mounted page driven through the same
 *   clicks against a fresh csr-mount of the end state (no SSR markup in
 *   either leg, so a divergence here is the client update machinery
 *   alone). Each leg compares like with like; cross-leg agreement is
 *   what the per-state `three-point` already pins. A page error or
 *   console error during the clicked leg fails the oracle too, after the
 *   DOM comparison (a DOM diff is the more specific signal).
 *
 *   The same clicked leg also feeds the keyed-identity oracle
 *   (`identity-hydrate` / `identity-csr`): a keyed row whose key is present
 *   both before and after the sequence must be the SAME DOM node. A
 *   rebuilt row serializes identically, so the DOM comparison above is
 *   blind to it; this is the proposal's "keyed node identity is preserved"
 *   invariant.
 *
 * Every failure writes a self-contained reproduction artifact
 * (`.explore/failures/<case>.json`, also attached to the Playwright
 * report): commit, scenario, initial + expected state, action sequence,
 * TSX source, both SSR documents, both captured DOM snapshots (raw and
 * normalized), and the browser's errors — enough to promote the case
 * into a permanent conformance fixture without re-running the sweep.
 * Because every prefix of a path is itself a path, the shortest failing
 * sequence is always among the results.
 *
 * Requires `.explore/manifest.json` — when absent every test is skipped
 * with a pointer to `bun run explore:generate`, same as the pairwise
 * suite, so a bare `bunx playwright test` never looks like a crash.
 *
 * Quarantine: `explore-quarantine.ts`, keyed `(scenario, subject,
 * oracle)`, with the pairwise rot-check (a quarantined case that starts
 * passing fails loudly).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Server } from 'node:http'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { createFixture, type JSXFixture } from '../src/types'
import { startFixtureServer, fixtureUrl, type HostMode } from './fixture-host'
import { captureDomState, diffDomState, type DomStateSnapshot } from './dom-state'
import { normalizeForCompare, runSnapOracle, runThreePointOracle, waitOneFrame } from './oracle-core'
import { runStep } from './interaction-runner'
import { exploreQuarantineEntry, type ExploreOracleKind } from './explore-quarantine'
import type { ExploreManifest, ExploreManifestEntry, ExploreStateEntry } from '../scripts/explore-generate'

const HERE = dirname(fileURLToPath(import.meta.url))
const EXPLORE_DIR = resolve(HERE, '../.explore')
const MANIFEST_PATH = resolve(EXPLORE_DIR, 'manifest.json')
const FAILURES_DIR = resolve(EXPLORE_DIR, 'failures')

function loadManifest(): ExploreManifest | undefined {
  if (!existsSync(MANIFEST_PATH)) return undefined
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as ExploreManifest
}

const manifest = loadManifest()

/** The click step for one action — `data-action` is the scenario contract (`explore/scenario.ts`). */
function actionSelector(action: string): string {
  return `button[data-action="${action}"]`
}

interface BrowserErrors {
  pageErrors: string[]
  consoleErrors: string[]
}

/**
 * Subscribe before the first navigation; both lists are read after the
 * clicked leg. The one console error that is the HOST's, not the
 * fixture's, is dropped: Chromium requests `/favicon.ico` for every
 * document and `fixture-host.ts` answers 404 (it serves fixtures, not
 * icons), logging "Failed to load resource" whenever that request happens
 * to land during the clicked leg. Measured: it was the sole failure on
 * every otherwise-green transition of the first sweep. Filtered by the
 * request URL, never by message text, so a fixture's own failed resource
 * load still counts.
 */
function collectBrowserErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { pageErrors: [], consoleErrors: [] }
  page.on('pageerror', err => errors.pageErrors.push(String(err?.stack ?? err)))
  page.on('console', msg => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return
    if (msg.location().url.endsWith('/favicon.ico')) return
    errors.consoleErrors.push(`[${msg.type()}] ${msg.text()}`)
  })
  return errors
}

interface TransitionCapture {
  incremental: DomStateSnapshot
  fresh: DomStateSnapshot
  errors: BrowserErrors
  /** Keyed rows (`<attr>=<key>`) that existed before the clicks and after, but as a different DOM node. */
  recreatedRows: string[]
}

/**
 * Keyed-row identity. A row carries its key as `data-key` (depth-0 loop)
 * or `data-key-N` (nested loops) — `keyAttrName`, `@barefootjs/shared`.
 * Before the first click every such element gets an expando naming its
 * `<attr>=<key>`; after the last click, any element whose `<attr>=<key>`
 * was present at the start but which lacks the matching expando is a row
 * the reconciler rebuilt instead of moving. A keyed loop must keep the
 * node for a key that survives (`cloneAll`'s "equal-looking values" and
 * every reorder included) — the DOM-vs-fresh comparison cannot see this,
 * since a rebuilt row serializes identically.
 */
const KEY_ATTR_PATTERN = '^data-key(-\\d+)?$'

async function markKeyedRows(page: Page): Promise<string[]> {
  return page.evaluate(pattern => {
    const re = new RegExp(pattern)
    const ids: string[] = []
    for (const el of Array.from(document.querySelectorAll('*'))) {
      for (const attr of el.getAttributeNames()) {
        if (!re.test(attr)) continue
        const id = `${attr}=${el.getAttribute(attr)}`
        ;(el as unknown as Record<string, unknown>).__bfExploreRow = id
        ids.push(id)
      }
    }
    return ids
  }, KEY_ATTR_PATTERN)
}

async function findRecreatedRows(page: Page, marked: string[]): Promise<string[]> {
  return page.evaluate(
    ({ pattern, marked }) => {
      const re = new RegExp(pattern)
      const initial = new Set(marked)
      const recreated: string[] = []
      for (const el of Array.from(document.querySelectorAll('*'))) {
        for (const attr of el.getAttributeNames()) {
          if (!re.test(attr)) continue
          const id = `${attr}=${el.getAttribute(attr)}`
          if (initial.has(id) && (el as unknown as Record<string, unknown>).__bfExploreRow !== id) recreated.push(id)
        }
      }
      return recreated
    },
    { pattern: KEY_ATTR_PATTERN, marked },
  )
}

/**
 * Drive `start` through `actions` under `mode`, capture, then load `end`
 * fresh under the same mode and capture. The caller compares.
 */
async function captureTransition(
  page: Page,
  mode: Extract<HostMode, 'hydrate' | 'csr-mount'>,
  start: JSXFixture,
  end: JSXFixture,
  actions: ReadonlyArray<string>,
  baseUrl: string,
): Promise<TransitionCapture> {
  const errors = collectBrowserErrors(page)
  await page.goto(fixtureUrl(baseUrl, start.id, mode))
  await waitOneFrame(page)
  const marked = await markKeyedRows(page)
  for (const action of actions) {
    // Bounded well under the test timeout so a genuinely missing button
    // (a real divergence) fails fast inside the quarantine wrapper's
    // `try`/`catch`, not via Playwright's outer force-cancel — see
    // `runStep`'s docstring.
    await runStep(page, { type: 'click', selector: actionSelector(action) }, { timeout: 5_000 })
  }
  await waitOneFrame(page)
  const incremental = await captureDomState(page)
  const recreatedRows = await findRecreatedRows(page, marked)

  await page.goto(fixtureUrl(baseUrl, end.id, mode))
  await waitOneFrame(page)
  const fresh = await captureDomState(page)
  return { incremental, fresh, errors, recreatedRows }
}

function assertKeyedIdentity(label: string, capture: TransitionCapture): void {
  expect(capture.recreatedRows, `${label}: keyed rows rebuilt instead of kept (key survived the sequence)`).toEqual([])
}

function assertTransitionAgrees(label: string, capture: TransitionCapture): void {
  const normIncremental = normalizeForCompare(capture.incremental.html)
  const normFresh = normalizeForCompare(capture.fresh.html)
  expect(normIncremental, `${label}: incremental DOM diverges from fresh render (structural HTML)`).toBe(normFresh)
  const stateDiff = diffDomState(capture.incremental, capture.fresh)
  expect(stateDiff, `${label}: incremental DOM diverges from fresh render (DOM state):\n${stateDiff.join('\n')}`).toEqual([])
  expect(capture.errors.pageErrors, `${label}: page errors during the clicked leg`).toEqual([])
  expect(capture.errors.consoleErrors, `${label}: console errors/warnings during the clicked leg`).toEqual([])
}

interface FailureArtifactInput {
  scenario: ExploreManifestEntry
  oracle: ExploreOracleKind
  subject: string
  actions: ReadonlyArray<string>
  start: ExploreStateEntry
  end: ExploreStateEntry
  capture?: TransitionCapture
  error: unknown
}

/**
 * Write the reproduction artifact for one failure and attach it to the
 * Playwright report. Everything a fixture author needs is inline — no
 * pointer back into `.explore/` that a later `explore:generate` would
 * overwrite.
 */
function writeFailureArtifact(testInfo: TestInfo, input: FailureArtifactInput): void {
  const { scenario, oracle, subject, actions, start, end, capture, error } = input
  const readOut = (file: string): string => readFileSync(resolve(EXPLORE_DIR, file), 'utf8')
  const caseId = `${scenario.scenarioId}__${subject.replace(/[^a-zA-Z0-9]+/g, '_')}__${oracle}`
  const artifact = {
    commit: manifest?.commit ?? 'unknown',
    scenarioId: scenario.scenarioId,
    componentName: scenario.componentName,
    oracle,
    subject,
    bounds: { maxDepth: scenario.maxDepth },
    seedFixtureIds: { start: start.fixtureId, end: end.fixtureId },
    initialState: start.state,
    actions,
    expectedState: end.state,
    source: scenario.source,
    componentIR: scenario.irFile ? JSON.parse(readOut(scenario.irFile)) : null,
    clientJs: readOut(start.clientJsFile),
    ssrHtml: { start: readOut(start.htmlFile), end: readOut(end.htmlFile) },
    dom: capture
      ? {
          incremental: { raw: capture.incremental, normalized: normalizeForCompare(capture.incremental.html) },
          fresh: { raw: capture.fresh, normalized: normalizeForCompare(capture.fresh.html) },
          stateDiff: diffDomState(capture.incremental, capture.fresh),
        }
      : null,
    browser: capture?.errors ?? null,
    failure: error instanceof Error ? (error.stack ?? error.message) : String(error),
  }
  const body = JSON.stringify(artifact, null, 2) + '\n'
  mkdirSync(FAILURES_DIR, { recursive: true })
  writeFileSync(resolve(FAILURES_DIR, `${caseId}.json`), body)
  void testInfo.attach(`explore-failure ${caseId}`, { body, contentType: 'application/json' })
}

test.describe('bounded state-space exploration', () => {
  test.skip(
    manifest === undefined,
    `${MANIFEST_PATH} not found — run \`bun run scripts/explore-generate.ts\` (or \`bun run test:explore\`) first.`,
  )

  if (manifest === undefined) {
    test('exploration skipped — manifest not generated', () => {})
    return
  }

  const okScenarios = manifest.scenarios.filter(
    (e): e is ExploreManifestEntry & Required<Pick<ExploreManifestEntry, 'states' | 'paths' | 'irFile'>> => e.status === 'ok',
  )

  function loadStateFixture(scenario: ExploreManifestEntry, state: ExploreStateEntry): JSXFixture {
    return createFixture({
      id: state.fixtureId,
      description: `explore: ${scenario.scenarioId} state s${state.index}`,
      // No JSX source to carry — the generated html/clientJs is all
      // `fixture-host.ts` reads (same as the pairwise suite).
      source: '',
      componentName: scenario.componentName,
      props: { initial: state.state },
      expectedHtml: readFileSync(resolve(EXPLORE_DIR, state.htmlFile), 'utf8'),
      expectedClientJs: readFileSync(resolve(EXPLORE_DIR, state.clientJsFile), 'utf8'),
    })
  }

  const fixturesById = new Map<string, JSXFixture>()
  for (const scenario of okScenarios) {
    for (const state of scenario.states) fixturesById.set(state.fixtureId, loadStateFixture(scenario, state))
  }

  let server: Server
  let baseUrl: string

  test.beforeAll(async () => {
    ;({ server, baseUrl } = await startFixtureServer([...fixturesById.values()]))
  })

  test.afterAll(async () => {
    await new Promise<void>(resolveClose => server.close(() => resolveClose()))
  })

  /** Mirrors `pairwise.playwright.ts`'s `runQuarantined`, keyed on the (scenario, subject, oracle) triple. */
  async function runQuarantined(
    scenarioId: string,
    subject: string,
    oracle: ExploreOracleKind,
    assertion: () => Promise<void>,
  ): Promise<void> {
    const entry = exploreQuarantineEntry(scenarioId, subject, oracle)
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
        `explore-quarantine.ts entry for [${scenarioId}]/[${subject}]/'${oracle}' is stale — the case now passes this oracle; ` +
          `delete the entry (and drop the reproduction from limitation '${entry.limitation}' if it was its last citation).`,
      )
    }
  }

  for (const scenario of okScenarios) {
    const stateByIndex = new Map(scenario.states.map(s => [s.index, s]))
    const initial = stateByIndex.get(0)!

    test.describe(scenario.scenarioId, () => {
      for (const state of scenario.states) {
        const fixture = fixturesById.get(state.fixtureId)!
        const subject = `state:s${state.index}`

        test(`[snap] ${subject} ${state.key}: hydration is a no-op on SSR state`, async ({ page }, testInfo) => {
          await runQuarantined(scenario.scenarioId, subject, 'snap', async () => {
            try {
              await runSnapOracle(page, fixture, baseUrl)
            } catch (error) {
              writeFailureArtifact(testInfo, { scenario, oracle: 'snap', subject, actions: [], start: state, end: state, error })
              throw error
            }
          })
        })

        test(`[three-point] ${subject} ${state.key}: SSR ≡ hydrated ≡ csr-mount`, async ({ page }, testInfo) => {
          await runQuarantined(scenario.scenarioId, subject, 'three-point', async () => {
            try {
              await runThreePointOracle(page, fixture, baseUrl)
            } catch (error) {
              writeFailureArtifact(testInfo, { scenario, oracle: 'three-point', subject, actions: [], start: state, end: state, error })
              throw error
            }
          })
        })
      }

      for (const path of scenario.paths) {
        if (path.actions.length === 0) continue
        const end = stateByIndex.get(path.toIndex)!
        const startFixture = fixturesById.get(initial.fixtureId)!
        const endFixture = fixturesById.get(end.fixtureId)!

        const legs: Array<{ oracle: ExploreOracleKind; identityOracle: ExploreOracleKind; mode: 'hydrate' | 'csr-mount' }> = [
          { oracle: 'transition-hydrate', identityOracle: 'identity-hydrate', mode: 'hydrate' },
          { oracle: 'transition-csr', identityOracle: 'identity-csr', mode: 'csr-mount' },
        ]
        for (const { oracle, identityOracle, mode } of legs) {
          test(`[${oracle}/${identityOracle}] ${path.id} → s${end.index}: incremental update equals fresh render, keyed rows kept`, async ({ page }, testInfo) => {
            test.setTimeout(30_000)
            const label = `${scenario.scenarioId} ${path.id} (${mode})`
            // One capture feeds both oracles; each is quarantined on its own
            // key, and both always run so a quarantined DOM divergence can't
            // mask an identity regression on the same path (or vice versa).
            let capture: TransitionCapture | undefined
            let captureError: unknown
            try {
              capture = await captureTransition(page, mode, startFixture, endFixture, path.actions, baseUrl)
            } catch (error) {
              captureError = error
            }
            const checks: Array<{ kind: ExploreOracleKind; assert: (c: TransitionCapture) => void }> = [
              { kind: oracle, assert: c => assertTransitionAgrees(label, c) },
              { kind: identityOracle, assert: c => assertKeyedIdentity(label, c) },
            ]
            const failures: unknown[] = []
            for (const { kind, assert } of checks) {
              try {
                await runQuarantined(scenario.scenarioId, path.id, kind, async () => {
                  try {
                    if (captureError !== undefined) throw captureError
                    assert(capture!)
                  } catch (error) {
                    writeFailureArtifact(testInfo, { scenario, oracle: kind, subject: path.id, actions: path.actions, start: initial, end, capture, error })
                    throw error
                  }
                })
              } catch (error) {
                failures.push(error)
              }
            }
            if (failures.length === 1) throw failures[0]
            if (failures.length > 1) throw new Error(failures.map(f => (f instanceof Error ? f.message : String(f))).join('\n\n'))
          })
        }
      }
    })
  }
})
