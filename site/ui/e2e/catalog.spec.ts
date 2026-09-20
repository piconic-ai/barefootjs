import { test, expect } from '@playwright/test'

test.describe('Component Catalog Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components')
  })

  test('displays catalog header', async ({ page }) => {
    await expect(page.locator('h1:has-text("Components")')).toBeVisible()
  })

  test('displays filter chips', async ({ page }) => {
    const filterGroup = page.locator('[role="group"][aria-label="Filter by category"]')
    await expect(filterGroup).toBeVisible()

    await expect(filterGroup.locator('a:has-text("All")')).toBeVisible()
    await expect(filterGroup.locator('a:has-text("Input")')).toBeVisible()
    await expect(filterGroup.locator('a:has-text("Display")')).toBeVisible()
    await expect(filterGroup.locator('a:has-text("Feedback")')).toBeVisible()
    await expect(filterGroup.locator('a:has-text("Navigation")')).toBeVisible()
    await expect(filterGroup.locator('a:has-text("Layout")')).toBeVisible()

    // "All" is the active chip when there's no `?tag=` in the URL.
    await expect(filterGroup.locator('a:has-text("All")')).toHaveAttribute('aria-current', 'page')
  })

  test('displays component cards in grid', async ({ page }) => {
    const cards = page.locator('[data-catalog-card]')
    // Catalog has 40+ components
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(30)
  })

  test('clicking the Input chip navigates to the filtered URL and filters the grid', async ({ page }) => {
    const filterGroup = page.locator('[role="group"][aria-label="Filter by category"]')
    const inputChip = filterGroup.locator('a:has-text("Input")')

    await inputChip.click()

    expect(page.url()).toContain('tag=input')

    // Input-tagged cards should be visible (e.g., Button)
    const buttonCard = page.locator('[data-catalog-card][data-tags~="input"]').first()
    await expect(buttonCard).toBeVisible()

    // Non-input cards are gone from the grid entirely (SSR-filtered, not hidden)
    await expect(page.locator('[data-catalog-card]:not([data-tags~="input"])')).toHaveCount(0)
  })

  test('clicking the active chip toggles the filter back off', async ({ page }) => {
    const filterGroup = page.locator('[role="group"][aria-label="Filter by category"]')
    const inputChip = filterGroup.locator('a:has-text("Input")')

    // Click to filter
    await inputChip.click()
    expect(page.url()).toContain('tag=input')

    // Click the now-active chip again to reset
    await inputChip.click()
    expect(page.url()).not.toContain('tag=')

    // All cards should be visible again
    const allCards = page.locator('[data-catalog-card]')
    expect(await allCards.count()).toBeGreaterThan(30)
  })

  test('browser back after filtering restores the previous filter', async ({ page }) => {
    const filterGroup = page.locator('[role="group"][aria-label="Filter by category"]')
    const inputChip = filterGroup.locator('a:has-text("Input")')

    await inputChip.click()
    expect(page.url()).toContain('tag=input')

    await inputChip.click()
    expect(page.url()).not.toContain('tag=')

    await page.goBack()
    expect(page.url()).toContain('tag=input')
    await expect(page.locator('[data-catalog-card]:not([data-tags~="input"])')).toHaveCount(0)
    const filterGroupAfterBack = page.locator('[role="group"][aria-label="Filter by category"]')
    await expect(filterGroupAfterBack.locator('a:has-text("Input")')).toHaveAttribute('aria-current', 'page')
  })
})

test.describe('Component Catalog Page — deep link', () => {
  test('a direct link to ?tag=input renders only matching cards with no flash', async ({ page, request }) => {
    // Pin the no-flash requirement against the RAW server HTML (pre-hydration),
    // not just the hydrated DOM state.
    const response = await request.get('/components?tag=input')
    const html = await response.text()
    expect(html).not.toMatch(/data-catalog-card[^>]*data-tags="(?!input)/)

    await page.goto('/components?tag=input')

    await expect(page.locator('[data-catalog-card][data-tags~="input"]').first()).toBeVisible()
    await expect(page.locator('[data-catalog-card]:not([data-tags~="input"])')).toHaveCount(0)

    const filterGroup = page.locator('[role="group"][aria-label="Filter by category"]')
    await expect(filterGroup.locator('a:has-text("Input")')).toHaveAttribute('aria-current', 'page')
    await expect(filterGroup.locator('a:has-text("All")')).not.toHaveAttribute('aria-current', 'page')
  })

  test('an unknown ?tag= value falls back to "All"', async ({ page }) => {
    await page.goto('/components?tag=bogus')

    const cards = page.locator('[data-catalog-card]')
    expect(await cards.count()).toBeGreaterThan(30)

    const filterGroup = page.locator('[role="group"][aria-label="Filter by category"]')
    await expect(filterGroup.locator('a:has-text("All")')).toHaveAttribute('aria-current', 'page')
  })
})
