/**
 * A keyed loop row whose conditional branch holds an element a callback
 * prop built keeps that element, and its state, when the row is reused
 * with a new item under the same key (#3894).
 *
 * The page is `fixtures/_keyed-row-branch-callback-element.ts`; that file
 * says why it is not in the conformance corpus. Its interactions run here
 * against both ways the page can come up in a browser: hydration of the
 * server HTML, and a client mount through `createComponent`.
 */

import { test } from '@playwright/test'
import type { Server } from 'node:http'
import { fixture } from '../fixtures/_keyed-row-branch-callback-element'
import { fixtureUrl, startFixtureServer, type HostMode } from './fixture-host'
import { runStep } from './interaction-runner'

let server: Server
let baseUrl: string

test.beforeAll(async () => {
  ;({ server, baseUrl } = await startFixtureServer([fixture]))
})

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

const MODES: ReadonlyArray<{ mode: HostMode; label: string }> = [
  { mode: 'hydrate', label: 'after hydration' },
  { mode: 'csr-mount', label: 'after a client mount' },
]

for (const { mode, label } of MODES) {
  test(`${fixture.id}: a callback-built element keeps its state across a same-key reuse ${label}`, async ({ page }, info) => {
    const browserLogs: string[] = []
    page.on('console', msg => browserLogs.push(`${msg.type()}: ${msg.text()}`))
    page.on('pageerror', err => browserLogs.push(`pageerror: ${err.message}`))
    await page.goto(fixtureUrl(baseUrl, fixture.id, mode))
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(null))))
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
        await info.attach('browser-logs.txt', { body: browserLogs.join('\n'), contentType: 'text/plain' })
      }
    }
  })
}
