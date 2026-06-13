/**
 * Capture the §6 showcase: a URL-bearing data change (sort / filter) that
 * updates the list **reactively from `searchParams()` with no outlet swap**.
 *
 * The proof is the shell counters: "partial navs" stays at 0 (the outlet is
 * never swapped) while "list updates" climbs (the reactive effect re-runs).
 * A pinned item keeps its state across a re-sort.
 *
 * Run against a running server (`bun run serve`) on :8787, with CHROME_PATH set.
 */
import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:8787'
const OUT = new URL('./screenshots/', import.meta.url).pathname

async function main() {
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : undefined,
  )
  const page = await browser.newPage({ viewport: { width: 1000, height: 820 }, deviceScaleFactor: 2 })

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)

  // Pin the first item, so we can prove its state survives a re-sort.
  const firstPin = page.locator('.sortable-list li .pin').first()
  const pinnedTitle = await page.locator('.sortable-list li .item-link').first().textContent()
  await firstPin.click()
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${OUT}sort-01-default.png` })

  const navsStart = await page.locator('#shell-navs').textContent()

  // Sort by title — reactive re-order, no swap.
  await page.locator('.controls a.sort', { hasText: 'title' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}sort-02-by-title.png` })
  const firstAfterSort = await page.locator('.sortable-list li:not([hidden]) .item-link').first().textContent()
  const navsAfterSort = await page.locator('#shell-navs').textContent()
  const updAfterSort = await page.locator('#shell-updates').textContent()
  const searchAfterSort = new URL(page.url()).search

  // Filter by tag — reactive filter, still no swap.
  await page.locator('.tags a.tag', { hasText: '#design' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}sort-03-tag-design.png` })
  const navsEnd = await page.locator('#shell-navs').textContent()
  const updEnd = await page.locator('#shell-updates').textContent()

  // The pinned item kept its state across the re-sort/filter (if still visible).
  const pinnedStillPinned = await page
    .locator(`.sortable-list li.pinned .item-link`)
    .first()
    .textContent()
    .catch(() => null)

  await browser.close()

  console.log(`first item: re-sorted to "${firstAfterSort}" (was "${pinnedTitle}")`)
  console.log(`partial navs (outlet swaps): ${navsStart} → ${navsAfterSort} → ${navsEnd}  ← stays 0`)
  console.log(`list updates (reactive):     1 → ${updAfterSort} → ${updEnd}`)
  console.log(`URL after sort: ${searchAfterSort}`)
  console.log(`pinned item after re-sort: ${JSON.stringify(pinnedStillPinned)}`)

  const ok =
    navsStart === '0' &&
    navsEnd === '0' && // NEVER swapped the outlet
    Number(updEnd) >= 3 && // reactive effect re-ran for each change
    searchAfterSort === '?sort=title' &&
    pinnedStillPinned === pinnedTitle // state preserved across re-sort
  console.log(
    ok
      ? '✓ sort/filter updated the list reactively with ZERO outlet swap; pin state preserved'
      : '✗ did not behave as expected',
  )
  console.log('\nScreenshots: sort-01-default.png, sort-02-by-title.png, sort-03-tag-design.png')
  if (!ok) process.exit(1)
}

main()
