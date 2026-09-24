/**
 * Site-wide soft navigation (@barefootjs/router, booted once from each
 * layout). A link click between pages of the same layout swaps the layout's
 * `bf-region`s instead of loading a new document; crossing between the docs
 * layout and the landing layout (different region sets, different <head>s)
 * is a full page load.
 *
 * A marker planted on `window` tells a soft navigation from a full load (a
 * load wipes it).
 */

import { test, expect, type Page } from '@playwright/test'

const plantReloadMarker = (page: Page) => page.evaluate(() => { (window as any).__bfSoftNavMarker = true })
const hasReloadMarker = (page: Page) => page.evaluate(() => (window as any).__bfSoftNavMarker === true)

/** The router sets `data-bf-navigating` on <html> until the swapped-in islands are live. */
const waitForSwap = (page: Page) => expect(page.locator('html[data-bf-navigating]')).toHaveCount(0)

const sidebar = (page: Page) => page.locator('aside[bf-region="sidebar"]')
const sidebarLink = (page: Page, href: string) => sidebar(page).locator(`a[href="${href}"]`)
const ACTIVE = /(^|\s)bg-accent(\s|$)/

test.describe('docs layout soft navigation', () => {
  test('a sidebar link swaps the doc without a full load', async ({ page }) => {
    await page.goto('/docs/introduction')
    await expect(sidebarLink(page, '/docs/introduction')).toHaveClass(ACTIVE)
    await plantReloadMarker(page)

    await sidebarLink(page, '/docs/quick-start').click()
    await expect(page).toHaveURL(/\/docs\/quick-start$/)
    await waitForSwap(page)

    expect(await hasReloadMarker(page)).toBe(true)
    await expect(page).toHaveTitle('Quick Start — BarefootJS')
    await expect(page.locator('h1.doc-title')).toHaveText('Quick Start')

    // The sidebar's active link moved with the navigation.
    await expect(sidebarLink(page, '/docs/quick-start')).toHaveClass(ACTIVE)
    await expect(sidebarLink(page, '/docs/introduction')).not.toHaveClass(ACTIVE)

    // Focus moved into the swapped doc, not the sidebar.
    await expect(page.locator('h1.doc-title')).toBeFocused()
  })

  test('back / forward restore the previous doc softly', async ({ page }) => {
    await page.goto('/docs/introduction')
    await plantReloadMarker(page)

    await sidebarLink(page, '/docs/quick-start').click()
    await expect(page).toHaveURL(/\/docs\/quick-start$/)
    await waitForSwap(page)

    await page.goBack()
    await expect(page).toHaveURL(/\/docs\/introduction$/)
    await waitForSwap(page)
    await expect(page).toHaveTitle('Introduction — BarefootJS')
    await expect(sidebarLink(page, '/docs/introduction')).toHaveClass(ACTIVE)

    await page.goForward()
    await expect(page).toHaveURL(/\/docs\/quick-start$/)
    await waitForSwap(page)
    await expect(page).toHaveTitle('Quick Start — BarefootJS')

    expect(await hasReloadMarker(page)).toBe(true)
  })

  test('leaving the docs layout for the landing layout is a full load', async ({ page }) => {
    await page.goto('/docs/introduction')
    await plantReloadMarker(page)

    await page.locator('header a[href="/"]:visible').first().click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.demo-frame')).toBeVisible()
    expect(await hasReloadMarker(page)).toBe(false)
  })
})

test.describe('landing layout soft navigation', () => {
  test('/integrations → / is soft and the demo pickers still work', async ({ page }) => {
    await page.goto('/integrations')
    await plantReloadMarker(page)

    await page.locator('a.lp-logo[href="/"]').click()
    await expect(page).toHaveURL(/\/$/)
    await waitForSwap(page)
    expect(await hasReloadMarker(page)).toBe(true)
    await expect(page).toHaveTitle('BarefootJS — TSX in. Your stack out.')

    // The demo's pickers are wired by a delegated listener in the layout's
    // <head>, so they work on a swapped-in hero too.
    await page.locator('select[data-select="adapter"]').selectOption('erb')
    await expect(page.locator('.out-panel[data-panel="counter-erb"]')).toBeVisible()
    await expect(page.locator('.out-panel[data-panel="counter-go"]')).toBeHidden()
  })
})
