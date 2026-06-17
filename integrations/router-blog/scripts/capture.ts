/**
 * Capture screenshots for the README. PORT=8788 bun run server.tsx & first.
 */
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.BASE ?? 'http://localhost:8788'
const OUT = new URL('../screenshots/', import.meta.url)
await mkdir(OUT, { recursive: true })

// Managed browser discovery (honours PLAYWRIGHT_BROWSERS_PATH / the default
// cache). Set PW_EXECUTABLE_PATH to override for a non-standard location.
const browser = await chromium.launch(
  process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {},
)
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } })
const shot = (name: string) => page.screenshot({ path: new URL(name, OUT).pathname })

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await shot('01-home.png')

// sort by title — list reorders, partial navs stays 0
await page.click('.controls a.sort:has-text("title")')
await page.waitForTimeout(300)
await shot('02-sort-title.png')

// open a post — region swaps, shell uptime keeps climbing; start the
// data-bf-permanent player so the post shot shows it mid-play
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.click('.sortable-list li:first-child .item-link')
await page.waitForTimeout(400)
await page.click('.island.player .player-toggle')
await page.waitForTimeout(600)
await shot('03-post.png')

// v1: page to the next post — the data-bf-permanent player keeps playing with
// its clock continued (live node preserved), while the ⏱ reading timer resets.
await page.click('.pager a.pager-link[href^="/posts/"]')
await page.waitForTimeout(700)
await shot('04-permanent-persist.png')

// v2: bump the sidebar (its own region), then open a post — the content region
// swaps while the sidebar island keeps its pin count.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.click('.sidebar-pin')
await page.click('.sidebar-pin')
await page.click('.sidebar-pin')
await page.click('.sortable-list li:first-child .item-link')
await page.waitForTimeout(500)
await shot('05-sibling-region.png')

await browser.close()
console.log('Wrote screenshots/')
