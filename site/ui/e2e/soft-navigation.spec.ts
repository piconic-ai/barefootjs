import { test, expect, type Page } from '@playwright/test'

/**
 * Site-wide soft navigation (@barefootjs/router, booted once from the
 * layout). A cross-route link click swaps the layout's `bf-region`s instead
 * of loading a new document: the header, command palette and theme stay
 * mounted, the `sidebar` region keeps its scroll container, and the islands
 * in the `page` region are disposed and re-hydrated.
 *
 * A marker planted on `window` tells a soft navigation from a full load (a
 * load wipes it).
 */
const plantReloadMarker = (page: Page) => page.evaluate(() => { (window as any).__bfSoftNavMarker = true })
const hasReloadMarker = (page: Page) => page.evaluate(() => (window as any).__bfSoftNavMarker === true)

/** The router sets `data-bf-navigating` on <html> until the swapped-in islands are live. */
const waitForSwap = (page: Page) => expect(page.locator('html[data-bf-navigating]')).toHaveCount(0)

const sidebar = (page: Page) => page.locator('nav[bf-region="sidebar"]')
const sidebarLink = (page: Page, href: string) => sidebar(page).locator(`a[href="${href}"]`)
const ACTIVE = /(^|\s)bg-accent(\s|$)/

test.describe('Soft navigation', () => {
  test('a sidebar link swaps the page without a full load', async ({ page }) => {
    await page.goto('/components/alert-dialog')
    await expect(sidebarLink(page, '/components/alert-dialog')).toHaveClass(ACTIVE)
    await plantReloadMarker(page)

    await sidebarLink(page, '/components/dialog').click()
    await expect(page).toHaveURL(/\/components\/dialog$/)
    await waitForSwap(page)

    expect(await hasReloadMarker(page)).toBe(true)
    await expect(page).toHaveTitle('Dialog | BarefootJS UI')
    await expect(page.locator('main h1')).toHaveText('Dialog')

    // The sidebar's active link moved with the navigation.
    await expect(sidebarLink(page, '/components/dialog')).toHaveClass(ACTIVE)
    await expect(sidebarLink(page, '/components/alert-dialog')).not.toHaveClass(ACTIVE)

    // Focus moved into the page content, not the sidebar that precedes it.
    await expect(page.locator('main h1')).toBeFocused()

    // The mobile prev/next moved too (it lives in the page region).
    await expect(page.locator('a[aria-label^="Next:"]')).toHaveAttribute('href', '/components/empty')
    await expect(page.locator('a[aria-label^="Next:"]')).toHaveCount(1)
  })

  test('islands in the swapped page are re-hydrated (portaled dialog opens)', async ({ page }) => {
    await page.goto('/components/alert-dialog')
    await plantReloadMarker(page)

    await sidebarLink(page, '/components/dialog').click()
    await expect(page).toHaveURL(/\/components\/dialog$/)
    await waitForSwap(page)
    expect(await hasReloadMarker(page)).toBe(true)

    const trigger = page.locator('[bf-s^="DialogBasicDemo_"][bf-r]').first().locator('button:has-text("Create Task")')
    await trigger.click()
    const dialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('text=Create New Task')).toBeVisible()
  })

  test('the sidebar keeps its scroll position across a navigation', async ({ page }) => {
    // A short viewport so the sidebar actually scrolls.
    await page.setViewportSize({ width: 1280, height: 400 })
    await page.goto('/components/popover')
    await plantReloadMarker(page)

    const target = sidebarLink(page, '/components/tooltip')
    await target.scrollIntoViewIfNeeded()
    const before = await sidebar(page).evaluate((el) => el.scrollTop)
    expect(before).toBeGreaterThan(0)

    // Click through the DOM: Playwright's own click re-scrolls the target
    // into view first, which would move the sidebar before the navigation.
    await target.evaluate((a) => (a as HTMLElement).click())
    await expect(page).toHaveURL(/\/components\/tooltip$/)
    await waitForSwap(page)

    expect(await hasReloadMarker(page)).toBe(true)
    expect(await sidebar(page).evaluate((el) => el.scrollTop)).toBe(before)
  })

  test('back / forward restore the previous page softly', async ({ page }) => {
    await page.goto('/components/alert-dialog')
    await plantReloadMarker(page)

    await sidebarLink(page, '/components/dialog').click()
    await expect(page).toHaveURL(/\/components\/dialog$/)
    await waitForSwap(page)

    await page.goBack()
    await expect(page).toHaveURL(/\/components\/alert-dialog$/)
    await waitForSwap(page)
    await expect(page).toHaveTitle('Alert Dialog | BarefootJS UI')
    await expect(sidebarLink(page, '/components/alert-dialog')).toHaveClass(ACTIVE)

    await page.goForward()
    await expect(page).toHaveURL(/\/components\/dialog$/)
    await waitForSwap(page)
    await expect(page).toHaveTitle('Dialog | BarefootJS UI')

    expect(await hasReloadMarker(page)).toBe(true)
  })

  test('a page with a different region set (gallery) is a full load', async ({ page }) => {
    await page.goto('/components/alert-dialog')
    await plantReloadMarker(page)

    // The Gallery group is collapsed on a component page.
    await sidebar(page).locator('summary:has-text("Gallery")').click()
    await sidebarLink(page, '/gallery/admin').click()
    await expect(page).toHaveURL(/\/gallery\/admin/)
    await expect(page.locator('nav[bf-region="sidebar"]')).toHaveCount(0)
    expect(await hasReloadMarker(page)).toBe(false)
  })

  test('the sidebar precedes the page content in document order', async ({ page }) => {
    await page.goto('/components/alert-dialog')
    const sidebarFirst = await page.evaluate(() => {
      const nav = document.querySelector('nav[bf-region="sidebar"]')!
      const main = document.querySelector('[bf-region="page"]')!
      return Boolean(nav.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(sidebarFirst).toBe(true)
  })

  test('/studio renders no region, so entering it from a single-region page is a full load', async ({ page, request }) => {
    // /studio's behaviour ships as inline <script>s, which swapped-in markup
    // never runs; it must never be a soft-navigation target.
    const html = await (await request.get('/studio')).text()
    expect(html).not.toContain('bf-region')

    // /gallery/* has a single root region, the one shape the router could
    // otherwise swap from; the docs pages already differ by their sidebar.
    await page.goto('/gallery/admin')
    await plantReloadMarker(page)
    await page.evaluate(() => {
      const a = document.createElement('a')
      a.href = '/studio'
      a.id = 'to-studio'
      a.textContent = 'studio'
      document.querySelector('[bf-region="page"]')!.prepend(a)
    })
    await page.locator('#to-studio').click()
    await expect(page).toHaveURL(/\/studio$/)
    await page.waitForLoadState('load')
    expect(await hasReloadMarker(page)).toBe(false)
  })
})
