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
 */

import { test, expect, type Page } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { loadAllSharedFixtures } from '../fixtures/_helpers'
import type { JSXFixture, InteractionStep } from '../src/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const RUNTIME_PATH = resolve(
  HERE,
  '../../client/dist/runtime/standalone.js',
)

let server: Server
let baseUrl: string
let runtimeSource: string

// Top-level await: discover every shared-component fixture by
// directory convention. Adding a new fixture file is now zero-touch
// for this spec — drop the file under `../fixtures/`, regenerate its
// snapshot via `scripts/snapshot.ts`, and it shows up here on the
// next test run.
const fixtures: JSXFixture[] = await loadAllSharedFixtures()
const byId = new Map(fixtures.map(f => [f.id, f]))

function hostPage(fixture: JSXFixture): string {
  // Importmap maps the bare specifier the compiled client JS uses to the
  // standalone runtime bundle. Order matters: importmap must precede the
  // module script that imports against it.
  //
  // Prefer `rawExpectedHtml`: `createFixture` whitespace-normalizes
  // `expectedHtml` for cross-adapter comparison, which would silently
  // mutate hydration inputs for any fixture whose DOM cares about
  // inter-element whitespace (e.g. `<pre>`, `<textarea>`).
  const html = fixture.rawExpectedHtml ?? fixture.expectedHtml ?? ''
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${fixture.id}</title>
<script type="importmap">
{ "imports": { "@barefootjs/client/runtime": "/__runtime.js" } }
</script>
</head>
<body>
${html}
<script type="module" src="__client.js"></script>
</body>
</html>`
}

function assertNever(value: never): never {
  throw new Error(`Unhandled InteractionStep variant: ${JSON.stringify(value)}`)
}

test.beforeAll(async () => {
  if (!existsSync(RUNTIME_PATH)) {
    throw new Error(
      `Runtime bundle not found at ${RUNTIME_PATH}.\n` +
        `Run \`bun run --filter '@barefootjs/client' build\` (or \`bun run build\` at the repo root) before this suite.`,
    )
  }
  runtimeSource = readFileSync(RUNTIME_PATH, 'utf8')

  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    // Route layout: `/__runtime.js` (shared), `/<fixtureId>/__client.js`
    // (per-fixture), `/<fixtureId>/` (host page). Keeping the runtime at a
    // fixture-independent path lets the host-page importmap use a stable
    // absolute URL without baking the fixture id into the bare specifier
    // resolution table.
    if (url.pathname === '/__runtime.js') {
      res.writeHead(200, { 'content-type': 'application/javascript' }).end(runtimeSource)
      return
    }
    const segments = url.pathname.split('/').filter(Boolean)
    const fixture = segments[0] ? byId.get(segments[0]) : undefined
    if (!fixture) {
      res.writeHead(404).end('not found')
      return
    }
    if (segments[1] === '__client.js') {
      res
        .writeHead(200, { 'content-type': 'application/javascript' })
        .end(fixture.expectedClientJs ?? '')
      return
    }
    res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(hostPage(fixture))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  // Use the bound IPv4 literal in baseUrl — on hosts where `localhost`
  // resolves to `::1` first the IPv6 listener doesn't exist and the
  // browser falls through to a connection error.
  baseUrl = `http://127.0.0.1:${port}`
})

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

async function runStep(page: Page, step: InteractionStep): Promise<void> {
  switch (step.type) {
    case 'click':
      await page.locator(step.selector).first().click()
      return
    case 'expectText':
      await expect(page.locator(step.selector).first()).toHaveText(step.text)
      return
    case 'expectContains':
      await expect(page.locator(step.selector).first()).toContainText(step.text)
      return
    case 'expectAttribute':
      await expect(page.locator(step.selector).first()).toHaveAttribute(
        step.attribute,
        step.value,
      )
      return
    case 'expectVisible':
      await expect(page.locator(step.selector).first()).toBeVisible()
      return
    case 'expectHidden':
      await expect(page.locator(step.selector).first()).toBeHidden()
      return
    case 'fill':
      await page.locator(step.selector).first().fill(step.value)
      return
    case 'expectValue':
      await expect(page.locator(step.selector).first()).toHaveValue(step.value)
      return
    case 'hover':
      await page.locator(step.selector).first().hover({ position: step.position })
      return
    case 'press':
      await page.locator(step.selector).first().press(step.key)
      return
    default:
      return assertNever(step)
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
    await page.goto(`${baseUrl}/${fixture.id}/`)
    // Hydration is microtask + rAF on the runtime side. A single rAF wait
    // covers both — we don't need to expose flushHydration just for tests.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(null))))
    // Only attach browser logs on failure — green runs would otherwise
    // bloat Playwright artifacts as the corpus grows.
    let failed = false
    try {
      for (const step of fixture.interactions!) {
        await runStep(page, step)
      }
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
