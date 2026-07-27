/**
 * Correctness gates for the barefoot-lazy SSR spike app (lazy effect-graph
 * measurement spike, spec/slot-unification.md §8). Requires dist/ built.
 * Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers bun gate.ts
 */
import { chromium } from '@playwright/test'
import { chromiumLaunchOptions } from '../../../runner/chromium.ts'
import { startServer } from '../../serve.ts'

const server = startServer(0)
const browser = await chromium.launch(chromiumLaunchOptions())
let failures = 0

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

try {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    // Ignore resource-load 404s (the browser's favicon.ico probe) — present
    // identically on the eager barefoot apps, pre-existing and app-unrelated.
    if (m.text().startsWith('Failed to load resource')) return
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`)
  })
  await page.goto(`http://localhost:${server.port}/barefoot-lazy/index.html`)
  await page.waitForFunction(() => document.body.dataset.hydrated === '1', undefined, { timeout: 10_000 })

  const fence = () =>
    page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    )

  const dangerCount = () => page.evaluate(() => document.querySelectorAll('#tbody tr.danger').length)
  const rowIsDanger = (i: number) =>
    page.evaluate((idx) => document.querySelectorAll('#tbody tr')[idx]?.classList.contains('danger') ?? false, i)

  check('0 danger rows before any click', (await dangerCount()) === 0, `got ${await dangerCount()}`)

  // Gate 1: click row 2's label -> exactly that row gets class="danger"
  await page.click('#tbody tr:nth-child(2) a.lbl')
  await fence()
  check('exactly 1 danger row after clicking row 2', (await dangerCount()) === 1, `got ${await dangerCount()}`)
  check('row 2 is the danger row', await rowIsDanger(1))

  // Gate 2: click row A (=2, already selected) then row B (=7): danger moves
  await page.click('#tbody tr:nth-child(7) a.lbl')
  await fence()
  check('exactly 1 danger row after second click', (await dangerCount()) === 1, `got ${await dangerCount()}`)
  check('danger moved to row 7', await rowIsDanger(6))
  check('row 2 no longer danger', !(await rowIsDanger(1)))

  // And back again (dedup/first-run-skip must not break repeated transitions)
  await page.click('#tbody tr:nth-child(2) a.lbl')
  await fence()
  check('danger moved back to row 2', (await rowIsDanger(1)) && (await dangerCount()) === 1)

  // SSR text intact (no hydration writes should have corrupted anything)
  const row991 = await page.evaluate(() => {
    const tr = document.querySelectorAll('#tbody tr')[990]
    return {
      id: tr?.querySelector('.col-md-1')?.textContent,
      label: tr?.querySelector('a.lbl')?.textContent,
    }
  })
  check('row 991 id text intact', row991.id === '991', JSON.stringify(row991))
  check('1000 rows present', (await page.evaluate(() => document.querySelectorAll('#tbody tr').length)) === 1000)
  check('no page errors/warnings', errors.length === 0, errors.join(' | '))
} finally {
  await browser.close()
  server.stop()
}

process.exit(failures === 0 ? 0 : 1)
