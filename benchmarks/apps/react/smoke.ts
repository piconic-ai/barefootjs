/**
 * Smoke test for the React benchmark app's production build.
 *
 * Serves dist/ over Bun.serve, drives it headlessly with Playwright, and
 * asserts krausest keyed-benchmark semantics per benchmarks/CONTRACT.md.
 * Not part of the shipped app — a local verification script.
 */
import { chromium } from '@playwright/test'
import { chromiumLaunchOptions } from '../../runner/chromium.ts'

const appDir = new URL('.', import.meta.url).pathname
const distDir = `${appDir}dist`

let passCount = 0
let failCount = 0

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passCount++
    console.log(`PASS: ${name}`)
  } else {
    failCount++
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname === '/' ? '/index.html' : url.pathname
    const file = Bun.file(`${distDir}${path}`)
    if (!(await file.exists())) return new Response('not found', { status: 404 })
    return new Response(file)
  },
})

const baseUrl = `http://localhost:${server.port}`

const browser = await chromium.launch(chromiumLaunchOptions())
const page = await browser.newPage()
page.on('pageerror', (err) => console.log('PAGE ERROR:', err))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text())
})

await page.goto(`${baseUrl}/index.html`)
await page.waitForSelector('body[data-ready]')

async function rowCount(): Promise<number> {
  return page.locator('#tbody tr').count()
}

async function rowAt(i: number): Promise<{ id: string; label: string; danger: boolean }> {
  const row = page.locator('#tbody tr').nth(i)
  const id = (await row.locator('td').nth(0).innerText()).trim()
  const label = (await row.locator('a.lbl').innerText()).trim()
  const cls = (await row.getAttribute('class')) ?? ''
  return { id, label, danger: cls.includes('danger') }
}

// #run -> 1000 rows
await page.click('#run')
check('run: 1000 rows', (await rowCount()) === 1000, `got ${await rowCount()}`)
const firstRow = await rowAt(0)
check('run: row markup has id + label', /^\d+$/.test(firstRow.id) && firstRow.label.length > 0)

// #update -> every 10th row gets ' !!!'
const row0Before = await rowAt(0)
const row1Before = await rowAt(1)
await page.click('#update')
const row0After = await rowAt(0)
const row1After = await rowAt(1)
check('update: row 0 label ends with " !!!"', row0After.label === `${row0Before.label} !!!`, row0After.label)
check('update: row 1 unchanged', row1After.label === row1Before.label, row1After.label)

// click row 2 a.lbl -> exactly one tr.danger
await page.locator('#tbody tr').nth(2).locator('a.lbl').click()
const dangerCount = await page.locator('#tbody tr.danger').count()
check('select: exactly one tr.danger', dangerCount === 1, `got ${dangerCount}`)
const dangerRowIndex = await page.locator('#tbody tr.danger').evaluate((el) => {
  return Array.from(el.parentElement!.children).indexOf(el)
})
check('select: danger row is row 2', dangerRowIndex === 2, `got index ${dangerRowIndex}`)

// #swaprows -> ids at 1/998 swapped
const before1 = await rowAt(1)
const before998 = await rowAt(998)
await page.click('#swaprows')
const after1 = await rowAt(1)
const after998 = await rowAt(998)
check('swaprows: row 1 now has old row 998 id', after1.id === before998.id, `${after1.id} vs ${before998.id}`)
check('swaprows: row 998 now has old row 1 id', after998.id === before1.id, `${after998.id} vs ${before1.id}`)

// click a.remove on row 4 -> 999 rows
const removedId = (await rowAt(4)).id
await page.locator('#tbody tr').nth(4).locator('a.remove').click()
const countAfterRemove = await rowCount()
check('remove: 999 rows', countAfterRemove === 999, `got ${countAfterRemove}`)
const idsAfterRemove = await page.locator('#tbody tr td:first-child').allInnerTexts()
check('remove: removed id is gone', !idsAfterRemove.map((s) => s.trim()).includes(removedId))

// #add -> +1000
const countBeforeAdd = await rowCount()
await page.click('#add')
check('add: +1000 rows', (await rowCount()) === countBeforeAdd + 1000, `got ${await rowCount()}`)

// #runlots -> 10000
await page.click('#runlots')
check('runlots: 10000 rows', (await rowCount()) === 10000, `got ${await rowCount()}`)

// #clear -> 0
await page.click('#clear')
check('clear: 0 rows', (await rowCount()) === 0, `got ${await rowCount()}`)
const tbodyExists = await page.locator('#tbody').count()
check('clear: #tbody element still exists', tbodyExists === 1)

await browser.close()
server.stop(true)

console.log(`\n${passCount} passed, ${failCount} failed`)
if (failCount > 0) process.exit(1)
