/**
 * Correctness gates for the barefoot-lazy DOM spike app (lazy effect-graph
 * measurement spike, spec/slot-unification.md §8). Requires dist/ built.
 * Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers bun gate.ts
 */
import { chromium } from '@playwright/test'
import { chromiumLaunchOptions } from '../../runner/chromium.ts'
import { startServer } from '../../runner/serve.ts'

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
  await page.waitForFunction(() => document.body.dataset.ready === '1', undefined, { timeout: 10_000 })

  const fence = () =>
    page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
  const click = async (sel: string) => {
    await page.click(sel)
    await fence()
  }
  const rowCount = () => page.evaluate(() => document.querySelectorAll('#tbody tr').length)
  const rowAt = (i: number) =>
    page.evaluate((idx) => {
      const tr = document.querySelectorAll('#tbody tr')[idx]
      return {
        id: tr?.querySelector('.col-md-1')?.textContent ?? null,
        label: tr?.querySelector('a.lbl')?.textContent ?? null,
        danger: tr?.classList.contains('danger') ?? false,
        key: tr?.getAttribute('data-key') ?? null,
      }
    }, i)

  // create1k: 1000 correct rows
  await click('#run')
  check('create1k: 1000 rows', (await rowCount()) === 1000, `got ${await rowCount()}`)
  const r0 = await rowAt(0)
  const r999 = await rowAt(999)
  check('create1k: row 1 id matches key', r0.id !== null && r0.id === r0.key, JSON.stringify(r0))
  check('create1k: row 1000 id matches key', r999.id !== null && r999.id === r999.key, JSON.stringify(r999))
  check('create1k: labels non-empty', !!r0.label && !!r999.label)

  // update10th: exactly every 10th label changes; spot-check rows 1 and 991
  const before = { r1: await rowAt(0), r2: await rowAt(1), r991: await rowAt(990), r992: await rowAt(991) }
  await click('#update')
  const after = { r1: await rowAt(0), r2: await rowAt(1), r991: await rowAt(990), r992: await rowAt(991) }
  check('update10th: row 1 label updated', after.r1.label === before.r1.label + ' !!!', `${before.r1.label} -> ${after.r1.label}`)
  check('update10th: row 991 label updated', after.r991.label === before.r991.label + ' !!!', `${before.r991.label} -> ${after.r991.label}`)
  check('update10th: row 2 label unchanged', after.r2.label === before.r2.label)
  check('update10th: row 992 label unchanged', after.r992.label === before.r992.label)
  const updatedCount = await page.evaluate(
    () => Array.from(document.querySelectorAll('#tbody tr a.lbl')).filter((a) => a.textContent!.endsWith(' !!!')).length,
  )
  check('update10th: exactly 100 labels updated', updatedCount === 100, `got ${updatedCount}`)

  // select: exactly one row highlighted
  await click('#tbody tr:nth-child(2) a.lbl')
  const dangers1 = await page.evaluate(() => document.querySelectorAll('#tbody tr.danger').length)
  check('select: exactly 1 danger row', dangers1 === 1, `got ${dangers1}`)
  check('select: row 2 is danger', (await rowAt(1)).danger)
  // move selection (dedup transition)
  await click('#tbody tr:nth-child(5) a.lbl')
  check('select: danger moved to row 5', (await rowAt(4)).danger)
  const dangers2 = await page.evaluate(() => document.querySelectorAll('#tbody tr.danger').length)
  check('select: still exactly 1 danger row', dangers2 === 1, `got ${dangers2}`)

  // swap: rows 2 and 999 (indexes 1 and 998) swap
  const swapBefore = { a: await rowAt(1), b: await rowAt(998) }
  await click('#swaprows')
  const swapAfter = { a: await rowAt(1), b: await rowAt(998) }
  check(
    'swap: rows 2 and 999 swapped',
    swapAfter.a.id === swapBefore.b.id && swapAfter.b.id === swapBefore.a.id,
    JSON.stringify({ swapBefore, swapAfter }),
  )
  check('swap: labels moved with rows', swapAfter.a.label === swapBefore.b.label && swapAfter.b.label === swapBefore.a.label)
  check('swap: selection followed its row', (await rowAt(4)).danger)

  // remove: row 5 (index 4, currently selected) removed
  const rm = await rowAt(4)
  await click('#tbody tr:nth-child(5) a.remove')
  check('remove: 999 rows', (await rowCount()) === 999, `got ${await rowCount()}`)
  const stillThere = await page.evaluate(
    (id) => Array.from(document.querySelectorAll('#tbody tr .col-md-1')).some((td) => td.textContent === id),
    rm.id,
  )
  check('remove: removed id gone', !stillThere)

  // clear empties
  await click('#clear')
  check('clear: 0 rows', (await rowCount()) === 0, `got ${await rowCount()}`)

  // create10k then append1k -> 11000
  await click('#runlots')
  check('create10k: 10000 rows', (await rowCount()) === 10000, `got ${await rowCount()}`)
  await click('#add')
  check('append1k after create10k: 11000 rows', (await rowCount()) === 11000, `got ${await rowCount()}`)
  const r10999 = await rowAt(10999)
  check('append1k: last row well-formed', r10999.id !== null && r10999.id === r10999.key && !!r10999.label, JSON.stringify(r10999))

  // clear again from 11k
  await click('#clear')
  check('clear from 11k: 0 rows', (await rowCount()) === 0, `got ${await rowCount()}`)

  // replace: run twice, first id changes
  await click('#run')
  const rep1 = await rowAt(0)
  await click('#run')
  const rep2 = await rowAt(0)
  check('replace1k: 1000 rows, new first id', (await rowCount()) === 1000 && rep1.id !== rep2.id, `${rep1.id} -> ${rep2.id}`)

  check('no page errors/warnings', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
  server.stop()
}
process.exit(failures === 0 ? 0 : 1)
