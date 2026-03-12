import { test, expect } from '@playwright/test'

test.describe('Breadcrumb Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/breadcrumb')
  })

  test.describe('Breadcrumb Structure', () => {
    test('renders breadcrumb navigation with correct ARIA attributes', async ({ page }) => {
      const breadcrumb = page.locator('[data-slot="breadcrumb"]').first()
      await expect(breadcrumb).toBeVisible()
      await expect(breadcrumb).toHaveAttribute('aria-label', 'breadcrumb')

      // Should be a <nav> element
      const tagName = await breadcrumb.evaluate((el) => el.tagName.toLowerCase())
      expect(tagName).toBe('nav')
    })

    test('renders breadcrumb list', async ({ page }) => {
      const list = page.locator('[data-slot="breadcrumb-list"]').first()
      await expect(list).toBeVisible()

      // Should be an <ol> element
      const tagName = await list.evaluate((el) => el.tagName.toLowerCase())
      expect(tagName).toBe('ol')
    })

    test('renders breadcrumb items', async ({ page }) => {
      const items = page.locator('[data-slot="breadcrumb-item"]')
      // Preview has 3 items (Home, Components, Breadcrumb)
      const count = await items.count()
      expect(count).toBeGreaterThanOrEqual(3)
    })

    test('renders breadcrumb links', async ({ page }) => {
      const links = page.locator('[data-slot="breadcrumb-link"]')
      const count = await links.count()
      expect(count).toBeGreaterThanOrEqual(2)

      // First link should contain "Home"
      await expect(links.first()).toContainText('Home')
    })

    test('renders current page with correct ARIA attributes', async ({ page }) => {
      const currentPage = page.locator('[data-slot="breadcrumb-page"]').first()
      await expect(currentPage).toBeVisible()
      await expect(currentPage).toHaveAttribute('aria-current', 'page')
      await expect(currentPage).toHaveAttribute('aria-disabled', 'true')
    })

    test('renders separators between items', async ({ page }) => {
      const separators = page.locator('[data-slot="breadcrumb-separator"]')
      const count = await separators.count()
      expect(count).toBeGreaterThanOrEqual(2)

      // Separators should have correct ARIA attributes
      const firstSeparator = separators.first()
      await expect(firstSeparator).toHaveAttribute('aria-hidden', 'true')
      await expect(firstSeparator).toHaveAttribute('role', 'presentation')
    })
  })

  test.describe('Breadcrumb Ellipsis', () => {
    test('renders ellipsis with sr-only text', async ({ page }) => {
      const ellipsis = page.locator('[data-slot="breadcrumb-ellipsis"]').first()
      await expect(ellipsis).toBeVisible()
      await expect(ellipsis).toHaveAttribute('aria-hidden', 'true')

      // Should contain sr-only "More" text
      // Class may be prefixed (layer-components:sr-only) by CSS layer prefixer
      const srOnly = ellipsis.locator('[class*="sr-only"]')
      await expect(srOnly).toHaveText('More')
    })
  })

  test.describe('Custom Separator', () => {
    test('renders custom separator text', async ({ page }) => {
      // Find separator containing "/" text
      const customSeparator = page.locator('[data-slot="breadcrumb-separator"]:has-text("/")')
      const count = await customSeparator.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })

})
