import { test, expect, type Page } from '@playwright/test'

const filterGroup = (page: Page) => page.locator('[role="group"][aria-label="Filter by category"]')
// The filter island exposes the active tag as `data-filter`; globals.css filters the grid on it.
const filterState = (page: Page) => page.locator('[data-catalog-filter]')
const inputCards = (page: Page) => page.locator('[data-catalog-card][data-tags~="input"]')
const nonInputCards = (page: Page) => page.locator('[data-catalog-card]:not([data-tags~="input"])')

/**
 * Plant a marker on `window`, then assert it survived a navigation — a full
 * page load would wipe it. This is how the soft (router-driven) `?tag=`
 * navigation is told apart from the hard navigation it replaced.
 */
const plantReloadMarker = (page: Page) => page.evaluate(() => { (window as any).__bfCatalogMarker = true })
const expectNoReload = async (page: Page) =>
  expect(await page.evaluate(() => (window as any).__bfCatalogMarker === true)).toBe(true)

test.describe('Component Catalog Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components')
  })

  test('displays catalog header', async ({ page }) => {
    await expect(page.locator('h1:has-text("Components")')).toBeVisible()
  })

  test('displays filter chips', async ({ page }) => {
    await expect(filterGroup(page)).toBeVisible()

    for (const label of ['All', 'Input', 'Display', 'Feedback', 'Navigation', 'Layout']) {
      await expect(filterGroup(page).locator(`a:has-text("${label}")`)).toBeVisible()
    }

    // "All" is the active chip when there's no `?tag=` in the URL.
    await expect(filterGroup(page).locator('a:has-text("All")')).toHaveAttribute('aria-current', 'page')
    await expect(filterState(page)).toHaveAttribute('data-filter', '')
  })

  test('displays component cards in grid', async ({ page }) => {
    const cards = page.locator('[data-catalog-card]')
    // Catalog has 40+ components
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(30)
  })

  test('clicking the Input chip is a soft navigation that filters the grid', async ({ page }) => {
    await plantReloadMarker(page)

    await filterGroup(page).locator('a:has-text("Input")').click()
    await expect(page).toHaveURL(/\/components\?tag=input$/)

    // The router handled it as a same-route, query-only navigation: no page load.
    await expectNoReload(page)

    await expect(filterState(page)).toHaveAttribute('data-filter', 'input')
    await expect(inputCards(page).first()).toBeVisible()
    // Every card is still in the DOM; the non-input ones are hidden by CSS.
    expect(await nonInputCards(page).count()).toBeGreaterThan(0)
    await expect(nonInputCards(page).first()).toBeHidden()
    await expect(filterGroup(page).locator('a:has-text("Input")')).toHaveAttribute('aria-current', 'page')
    await expect(filterGroup(page).locator('a:has-text("All")')).not.toHaveAttribute('aria-current', 'page')
  })

  test('clicking the active chip toggles the filter back off', async ({ page }) => {
    await plantReloadMarker(page)
    const inputChip = filterGroup(page).locator('a:has-text("Input")')

    await inputChip.click()
    await expect(page).toHaveURL(/\/components\?tag=input$/)

    // The now-active chip links back to the unfiltered page.
    await inputChip.click()
    await expect(page).toHaveURL(/\/components$/)
    await expectNoReload(page)

    await expect(filterState(page)).toHaveAttribute('data-filter', '')
    await expect(nonInputCards(page).first()).toBeVisible()
    await expect(filterGroup(page).locator('a:has-text("All")')).toHaveAttribute('aria-current', 'page')
  })

  test('browser back after filtering restores the previous filter', async ({ page }) => {
    await plantReloadMarker(page)
    const inputChip = filterGroup(page).locator('a:has-text("Input")')

    await inputChip.click()
    await expect(page).toHaveURL(/\/components\?tag=input$/)
    await inputChip.click()
    await expect(page).toHaveURL(/\/components$/)

    // A query-only popstate on the same route is handled by the router too.
    await page.goBack()
    await expect(page).toHaveURL(/\/components\?tag=input$/)
    await expectNoReload(page)

    await expect(filterState(page)).toHaveAttribute('data-filter', 'input')
    await expect(nonInputCards(page).first()).toBeHidden()
    await expect(filterGroup(page).locator('a:has-text("Input")')).toHaveAttribute('aria-current', 'page')
  })

  test('a plain link on the page is still a normal navigation', async ({ page }) => {
    // The router is scoped to the filter chips: a card link leaves the page.
    await page.locator('[data-catalog-card][data-tags~="input"]').first().click()
    await page.waitForURL(/\/components\/[a-z-]+$/)
    await expect(page.locator('[data-catalog-filter]')).toHaveCount(0)
  })
})

test.describe('Component Catalog Page — deep link', () => {
  test('a direct link to ?tag=input renders already filtered — no flash', async ({ page, request }) => {
    // Pin the no-flash requirement against the RAW server HTML (pre-hydration):
    // the filter's data-filter attribute is what the stylesheet filters the grid
    // on, so it has to be in the server output, not set by client JS.
    const response = await request.get('/components?tag=input')
    const html = await response.text()
    expect(html).toMatch(/<div[^>]*data-filter="input"/)

    await page.goto('/components?tag=input')

    await expect(inputCards(page).first()).toBeVisible()
    await expect(nonInputCards(page).first()).toBeHidden()

    await expect(filterGroup(page).locator('a:has-text("Input")')).toHaveAttribute('aria-current', 'page')
    await expect(filterGroup(page).locator('a:has-text("All")')).not.toHaveAttribute('aria-current', 'page')
  })

  test('an unknown ?tag= value falls back to "All"', async ({ page }) => {
    await page.goto('/components?tag=bogus')

    await expect(filterState(page)).toHaveAttribute('data-filter', '')
    const cards = page.locator('[data-catalog-card]')
    expect(await cards.count()).toBeGreaterThan(30)
    await expect(nonInputCards(page).first()).toBeVisible()

    await expect(filterGroup(page).locator('a:has-text("All")')).toHaveAttribute('aria-current', 'page')
  })
})
