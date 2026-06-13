/**
 * Capture the (normally invisible) hover-prefetch behaviour.
 *
 * Hovering a link makes the router prefetch its page into the cache; the
 * demo marks prefetched links with a "⚡ ready" badge and a live counter,
 * and shows whether the next navigation was served "⚡ cache" or "network".
 *
 *   1. hover three post cards → they gain "⚡ ready", counter reaches 3
 *   2. click one → served from cache (no network wait)
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 2 })

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)

  // Hover the first three post cards — each dwell triggers a prefetch.
  const cards = page.locator('.cards .card-link')
  for (let i = 0; i < 3; i++) {
    await cards.nth(i).hover()
    await page.waitForTimeout(160) // > prefetchDelay (65ms)
  }
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}prefetch-01-hover.png` })

  const prefetchedCount = await page.locator('#shell-prefetched').textContent()

  // Click the first (already prefetched) card — should be served from cache.
  const t0 = Date.now()
  await cards.nth(0).click()
  await page.waitForSelector('.island.timer')
  const clickToContent = Date.now() - t0
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}prefetch-02-from-cache.png` })

  const lastNav = await page.locator('#shell-lastnav').textContent()

  await browser.close()

  console.log(`prefetched after hovering 3 cards: ${prefetchedCount}`)
  console.log(`click → content: ${clickToContent}ms · last nav: ${lastNav}`)

  const ok = prefetchedCount === '3' && /cache/.test(lastNav ?? '')
  console.log(
    ok
      ? '✓ hovering prefetched 3 pages; the click was served from cache (no network wait)'
      : '✗ prefetch visualization did not behave as expected',
  )
  console.log('\nScreenshots: prefetch-01-hover.png, prefetch-02-from-cache.png')
  if (!ok) process.exit(1)
}

main()
