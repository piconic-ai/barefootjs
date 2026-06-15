/**
 * Capture screenshots for the README. PORT=8788 bun run server.tsx & first.
 */
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.BASE ?? 'http://localhost:8788'
const OUT = new URL('../screenshots/', import.meta.url)
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } })
const shot = (name: string) => page.screenshot({ path: new URL(name, OUT).pathname })

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await shot('01-home.png')

// sort by title — list reorders, partial navs stays 0
await page.click('.controls a.sort:has-text("title")')
await page.waitForTimeout(300)
await shot('02-sort-title.png')

// open a post — outlet swaps, shell uptime keeps climbing
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.click('.sortable-list li:first-child .item-link')
await page.waitForTimeout(600)
await shot('03-post.png')

await browser.close()
console.log('Wrote screenshots/')
