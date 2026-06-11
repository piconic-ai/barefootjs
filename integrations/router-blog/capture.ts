/**
 * Drive the blog with a real browser and capture the partial-navigation
 * behaviour as screenshots.
 *
 * Asserts the things the screenshots are meant to show:
 *   - the content swaps (title + body change),
 *   - the shell survives (uptime keeps climbing, never resets),
 *   - the partial-nav counter increments (outlet was swapped, not reloaded).
 *
 * Run against an already-running server (`bun run serve`) on :8787.
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
  await page.waitForTimeout(700) // let the uptime clock advance visibly
  await page.screenshot({ path: `${OUT}01-home.png` })
  const uptimeHome = await page.textContent('#shell-uptime')

  // Open the first post — only the outlet should swap.
  await page.click('.cards .card-link >> nth=0')
  await page.waitForSelector('#next-post')
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}02-post.png` })

  const titleAfterNav = await page.title()
  const navsAfterFirst = await page.textContent('#shell-navs')

  // Page forward — second partial navigation.
  await page.click('#next-post')
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}03-next-post.png` })

  const uptimeEnd = await page.textContent('#shell-uptime')
  const navsEnd = await page.textContent('#shell-navs')

  await browser.close()

  // Verify the demo actually demonstrates what the screenshots claim.
  const num = (s: string | null) => Number((s ?? '0').replace('s', ''))
  const checks: Array<[string, boolean]> = [
    ['title updated on navigation', /Barefoot Blog/.test(titleAfterNav) && titleAfterNav !== 'Barefoot Blog — Latest posts'],
    ['partial-nav counter reached 2', navsEnd === '2'],
    ['counter incremented after first nav', navsAfterFirst === '1'],
    ['uptime never reset (kept climbing)', num(uptimeEnd) > num(uptimeHome)],
  ]

  let ok = true
  for (const [label, pass] of checks) {
    console.log(`${pass ? '✓' : '✗'} ${label}`)
    if (!pass) ok = false
  }
  console.log(`\nuptime: home=${uptimeHome} end=${uptimeEnd} · navs=${navsEnd} · title="${titleAfterNav}"`)
  if (!ok) process.exit(1)
  console.log('\nScreenshots written to integrations/router-blog/screenshots/')
}

main()
