/**
 * Standalone Playwright smoke test for the SolidJS benchmark app.
 * Builds the app, serves dist/ with Bun.serve, drives it with headless
 * Chromium, and prints PASS/FAIL per correctness check from CONTRACT.md.
 */
import { extname, join } from 'node:path'
import { chromium } from '@playwright/test'
import { chromiumLaunchOptions } from '../../runner/chromium.ts'
import { build } from './build'

const DIST_DIR = join(import.meta.dirname, 'dist')

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

function startServer() {
  return Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      const rest = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
      const filePath = join(DIST_DIR, rest)
      const file = Bun.file(filePath)
      if (!(await file.exists())) return new Response('Not found', { status: 404 })
      const type = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream'
      return new Response(file, { headers: { 'Content-Type': type } })
    },
  })
}

let passCount = 0
let failCount = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`PASS  ${name}`)
    passCount++
  } else {
    console.log(`FAIL  ${name}${detail !== undefined ? ` — ${detail}` : ''}`)
    failCount++
  }
}

interface RowSnapshot {
  id: number
  label: string
  danger: boolean
}

async function main() {
  await build()
  const server = startServer()
  const browser = await chromium.launch(chromiumLaunchOptions())
  try {
    const page = await browser.newPage()
    await page.goto(`http://localhost:${server.port}/`)
    await page.waitForSelector('body[data-ready="1"]')

    const getRows = (): Promise<RowSnapshot[]> =>
      page.$$eval('#tbody > tr', (trs) =>
        trs.map((tr) => ({
          id: Number(tr.querySelector('td.col-md-1')?.textContent),
          label: tr.querySelector('a.lbl')?.textContent ?? '',
          danger: tr.classList.contains('danger'),
        }))
      )

    // #run -> 1000 correct rows
    await page.click('#run')
    let rows = await getRows()
    check('#run creates 1000 rows', rows.length === 1000, `got ${rows.length}`)
    check(
      '#run row ids sequential 1..1000',
      rows[0]?.id === 1 && rows[999]?.id === 1000,
      `first=${rows[0]?.id} last=${rows[999]?.id}`
    )

    // #update -> every 10th row label ends with ' !!!', others untouched
    await page.click('#update')
    rows = await getRows()
    check('#update row0 label ends with " !!!"', rows[0].label.endsWith(' !!!'), rows[0].label)
    check('#update row1 label unchanged', !rows[1].label.endsWith(' !!!'), rows[1].label)
    check('#update row10 label ends with " !!!"', rows[10].label.endsWith(' !!!'), rows[10].label)

    // select row 2 (0-based index 1) via a.lbl -> exactly one tr.danger
    await page.click('#tbody > tr:nth-child(2) a.lbl')
    rows = await getRows()
    const dangerCount = rows.filter((r) => r.danger).length
    check('select -> exactly one tr.danger', dangerCount === 1, `count=${dangerCount}`)
    check('select -> row index 1 is the danger row', rows[1]?.danger === true, JSON.stringify(rows[1]))

    // #swaprows -> row data at index 1 and 998 swapped
    const beforeSwap = await getRows()
    await page.click('#swaprows')
    rows = await getRows()
    check(
      'swaprows swaps idx 1 <-> 998',
      rows[1].id === beforeSwap[998].id && rows[998].id === beforeSwap[1].id,
      `idx1=${rows[1].id} (expected ${beforeSwap[998].id}), idx998=${rows[998].id} (expected ${beforeSwap[1].id})`
    )

    // remove row idx 4 via a.remove -> 999 rows, removed id gone
    const beforeRemove = await getRows()
    const removedId = beforeRemove[4].id
    await page.click('#tbody > tr:nth-child(5) a.remove')
    rows = await getRows()
    check('remove -> 999 rows remain', rows.length === 999, `got ${rows.length}`)
    check('remove -> removed id is gone', !rows.some((r) => r.id === removedId), `id ${removedId} still present`)

    // #add -> +1000 rows appended
    const beforeAdd = await getRows()
    await page.click('#add')
    rows = await getRows()
    check(
      '#add appends 1000 rows',
      rows.length === beforeAdd.length + 1000,
      `got ${rows.length}, expected ${beforeAdd.length + 1000}`
    )

    // #runlots -> replace all with 10000 rows
    await page.click('#runlots')
    rows = await getRows()
    check('#runlots creates 10000 rows', rows.length === 10000, `got ${rows.length}`)

    // #clear -> 0 rows
    await page.click('#clear')
    rows = await getRows()
    check('#clear empties the table', rows.length === 0, `got ${rows.length}`)
  } finally {
    await browser.close()
    server.stop(true)
  }

  console.log(`\n${passCount} passed, ${failCount} failed`)
  if (failCount > 0) process.exit(1)
}

await main()
