import { test, expect, type Page } from '@playwright/test'

// The blog routes are mounted under the integration's base path.
const BLOG = '/integrations/h3/blog'

// Tag a live node with an identity marker; read it back to tell a surviving
// node (region kept) from a freshly rendered one (region swapped).
const mark = (page: Page, sel: string) =>
  page.$eval(sel, (el) => {
    ;(el as unknown as { __mark?: string }).__mark = 'KEEP'
  })
const marker = (page: Page, sel: string) =>
  page.$eval(sel, (el) => (el as unknown as { __mark?: string }).__mark).catch(() => null)

test('v0.5: sort/tag is a query-only update with no region swap', async ({ page }) => {
  await page.goto(BLOG, { waitUntil: 'networkidle' })
  await expect(page.locator('.sortable-list li')).toHaveCount(10)
  await mark(page, '.content') // the list root — a region swap would replace it
  await page.click('.controls a.sort:has-text("title")')
  await page.waitForTimeout(150)
  const first = await page.locator('.sortable-list li:first-child .item-link').innerText()
  expect(first[0] === 'A' || first[0] === 'B').toBe(true)
  expect(await marker(page, '.content')).toBe('KEEP') // not swapped
  expect(page.url()).toContain('sort=title')
})

test('v0: clicking a post swaps the content region; shell + theme persist', async ({ page }) => {
  await page.goto(BLOG, { waitUntil: 'networkidle' })
  await page.click('.toggle')
  const theme = await page.getAttribute('html', 'data-theme')
  await page.click('.sortable-list li:first-child .item-link')
  await page.waitForSelector('.island.like', { timeout: 3000 })
  expect(await page.locator('.island.like').count()).toBe(1)
  expect(await page.getAttribute('html', 'data-theme')).toBe(theme) // shell never reloaded
  await page.click('.island.like')
  expect(await page.locator('.island.like .v').innerText()).toBe('1')
})

test('v1: data-bf-permanent keeps the player live across a post→post swap', async ({ page }) => {
  test.setTimeout(15000)
  await page.goto(BLOG, { waitUntil: 'networkidle' })
  await page.click('.sortable-list li:first-child .item-link')
  await page.waitForSelector('.now-playing-bar', { timeout: 3000 })
  await page.click('.now-playing-bar .np-toggle') // ▶ play
  await page.waitForTimeout(900)
  const before = Number(await page.locator('.now-playing-bar .np-time').innerText())
  expect(before).toBeGreaterThan(0.4)
  await mark(page, '[data-bf-permanent="now-playing"]')
  await page.click('.pager a.pager-link[href*="/posts/"]')
  await page.waitForTimeout(400)
  expect(await marker(page, '[data-bf-permanent="now-playing"]')).toBe('KEEP') // same live node
  expect(Number(await page.locator('.now-playing-bar .np-time').innerText())).toBeGreaterThanOrEqual(before)
  expect(Number(await page.locator('.island.timer .v').innerText())).toBeLessThan(0.5) // unmarked timer reset
  // post → index ("← All posts"): the player is also data-bf-permanent on the
  // list, so the same live node survives returning to the index — not reset.
  const elapsed = Number(await page.locator('.now-playing-bar .np-time').innerText())
  await page.click('.post .back')
  await page.waitForSelector('.sortable-list li', { timeout: 3000 })
  expect(await marker(page, '[data-bf-permanent="now-playing"]')).toBe('KEEP') // same live node on the index
  expect(Number(await page.locator('.now-playing-bar .np-time').innerText())).toBeGreaterThanOrEqual(elapsed)
})

test('v2 sibling: the sidebar region persists while content swaps', async ({ page }) => {
  await page.goto(BLOG, { waitUntil: 'networkidle' })
  await page.click('.sidebar-pin')
  await page.click('.sidebar-pin')
  expect(await page.locator('.sidebar-pin .v').innerText()).toBe('2')
  await mark(page, 'aside[bf-region] .sidebar')
  await page.click('.sortable-list li:first-child .item-link')
  await page.waitForSelector('.island.like', { timeout: 3000 })
  expect(await page.locator('.sidebar-pin .v').innerText()).toBe('2') // state survived
  expect(await marker(page, 'aside[bf-region] .sidebar')).toBe('KEEP') // same node
})

test('v2 nested: the outer toolbar region persists while the inner content swaps', async ({ page }) => {
  await page.goto(BLOG, { waitUntil: 'networkidle' })
  await page.click('.reader-toolbar .rt-btn[aria-label="larger"]')
  await page.click('.reader-toolbar .rt-btn[aria-label="larger"]')
  expect(await page.locator('.reader-toolbar .v').innerText()).toBe('3')
  await mark(page, '.reader-toolbar')
  await page.click('.sortable-list li:first-child .item-link')
  await page.waitForSelector('.island.like', { timeout: 3000 })
  expect(await page.locator('.reader-toolbar .v').innerText()).toBe('3') // outer region kept
  expect(await marker(page, '.reader-toolbar')).toBe('KEEP') // same node
})
