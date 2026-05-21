/**
 * Fixture-driven real-browser hydration tests (#1467).
 *
 * For each fixture that ships an `expectedHtml` + `expectedClientJs` +
 * `interactions` triple, this spec:
 *   1. Spins up a minimal Bun.serve that serves a host page whose body
 *      contains `expectedHtml` and whose `<script type="module">` imports
 *      `expectedClientJs`.
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
 */

import { test, expect, type Page } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fixture as counterShared } from '../fixtures/counter-shared'
import type { JSXFixture, InteractionStep } from '../src/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const RUNTIME_PATH = resolve(
  HERE,
  '../../client/dist/runtime/standalone.js',
)
const RUNTIME_SOURCE = readFileSync(RUNTIME_PATH, 'utf8')

let server: Server
let baseUrl: string

const fixtures: JSXFixture[] = [counterShared]
const byId = new Map(fixtures.map(f => [f.id, f]))

function hostPage(fixture: JSXFixture): string {
  // Importmap maps the bare specifier the compiled client JS uses to the
  // standalone runtime bundle. Order matters: importmap must precede the
  // module script that imports against it.
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
${fixture.expectedHtml ?? ''}
<script type="module" src="__client.js"></script>
</body>
</html>`
}

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    // Route layout: `/__runtime.js` (shared), `/<fixtureId>/__client.js`
    // (per-fixture), `/<fixtureId>/` (host page). Keeping the runtime at a
    // fixture-independent path lets the host-page importmap use a stable
    // absolute URL without baking the fixture id into the bare specifier
    // resolution table.
    if (url.pathname === '/__runtime.js') {
      res.writeHead(200, { 'content-type': 'application/javascript' }).end(RUNTIME_SOURCE)
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
  baseUrl = `http://localhost:${port}`
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
    try {
      for (const step of fixture.interactions!) {
        await runStep(page, step)
      }
    } finally {
      await info.attach('browser-logs.txt', {
        body: browserLogs.join('\n'),
        contentType: 'text/plain',
      })
    }
  })
}
