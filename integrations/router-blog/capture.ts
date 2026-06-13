/**
 * Drive the blog with a real browser and capture the partial-navigation
 * behaviour as screenshots, asserting what they claim:
 *   - content swaps (title changes), shell survives (uptime keeps climbing),
 *   - partial-nav counter increments (outlet swapped, not reloaded),
 *   - a theme toggled in the shell persists across navigation.
 *
 * Run against a running server (`bun run serve`) on :8787.
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
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}01-home.png` })
  const uptimeHome = await page.locator('#shell-uptime').textContent()

  // Open the first post — only the outlet swaps; islands hydrate.
  await page.click('.cards .card-link >> nth=0')
  await page.waitForSelector('.island.timer')
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}02-post.png` })
  const titleAfterNav = await page.title()
  const navsAfterFirst = await page.locator('#shell-navs').textContent()

  // Toggle theme in the shell, then page forward — the theme must persist.
  await page.click('#theme-toggle')
  await page.click('#next-post')
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}03-next-post-light.png` })

  const theme = await page.evaluate(() => document.documentElement.dataset.theme)
  const uptimeEnd = await page.locator('#shell-uptime').textContent()
  const navsEnd = await page.locator('#shell-navs').textContent()

  await browser.close()

  const num = (s: string | null) => Number((s ?? '0').replace('s', ''))
  const checks: Array<[string, boolean]> = [
    ['title updated on navigation', /Barefoot Blog/.test(titleAfterNav) && titleAfterNav !== 'Barefoot Blog — Latest posts'],
    ['partial-nav counter reached 2', navsEnd === '2'],
    ['counter incremented after first nav', navsAfterFirst === '1'],
    ['uptime never reset (kept climbing)', num(uptimeEnd) > num(uptimeHome)],
    ['theme toggled in shell persisted across nav', theme === 'light'],
  ]

  let ok = true
  for (const [label, pass] of checks) {
    console.log(`${pass ? '✓' : '✗'} ${label}`)
    if (!pass) ok = false
  }
  console.log(`\nuptime: home=${uptimeHome} end=${uptimeEnd} · navs=${navsEnd} · theme=${theme} · title="${titleAfterNav}"`)
  if (!ok) process.exit(1)
  console.log('\nScreenshots written to integrations/router-blog/screenshots/')
}

main()
