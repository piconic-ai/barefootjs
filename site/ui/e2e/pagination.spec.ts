import { test, expect } from '@playwright/test'

test.describe('Pagination Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/pagination')
  })

  test.describe('Preview', () => {
    test('displays pagination nav element', async ({ page }) => {
      const nav = page.locator('nav[aria-label="pagination"]').first()
      await expect(nav).toBeVisible()
    })

    test('has active page link with aria-current', async ({ page }) => {
      const activeLink = page.locator('[aria-current="page"]').first()
      await expect(activeLink).toBeVisible()
      await expect(activeLink).toContainText('1')
    })

    test('displays Previous and Next buttons', async ({ page }) => {
      const prev = page.locator('a[aria-label="Go to previous page"]').first()
      const next = page.locator('a[aria-label="Go to next page"]').first()
      await expect(prev).toBeVisible()
      await expect(next).toBeVisible()
    })

    test('displays ellipsis', async ({ page }) => {
      const ellipsis = page.locator('[data-slot="pagination-ellipsis"]').first()
      await expect(ellipsis).toBeVisible()
    })
  })

  test.describe('Basic', () => {
    test('displays basic example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Basic")')).toBeVisible()
    })

    test('has pagination structure', async ({ page }) => {
      // BasicDemo is stateless, so use the second nav[aria-label="pagination"] (after preview)
      const navs = page.locator('nav[aria-label="pagination"]')
      expect(await navs.count()).toBeGreaterThanOrEqual(2)

      const basicNav = navs.nth(1)
      await expect(basicNav).toBeVisible()

      // Page links only (exclude Previous/Next which also use PaginationLink)
      const pageLinks = basicNav.locator('[data-slot="pagination-link"]:not([aria-label])')
      expect(await pageLinks.count()).toBeGreaterThanOrEqual(3)
    })
  })

  test.describe('Dynamic', () => {
    test('displays dynamic example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Dynamic")')).toBeVisible()
    })

    test('shows current page indicator', async ({ page }) => {
      const section = page.locator('[bf-s^="PaginationDynamicDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
      await expect(section.locator('text=Page 1 of 5')).toBeVisible()
    })

    test('page 1 is active by default', async ({ page }) => {
      const section = page.locator('[bf-s^="PaginationDynamicDemo_"]:not([data-slot])').first()
      const page1Link = section.locator('[data-slot="pagination-link"]', { hasText: '1' })
      await expect(page1Link).toHaveAttribute('data-active', 'true')
    })

    test('clicking page link updates active state', async ({ page }) => {
      const section = page.locator('[bf-s^="PaginationDynamicDemo_"]:not([data-slot])').first()

      const page2Link = section.locator('[data-slot="pagination-link"]', { hasText: '2' })
      await page2Link.click()

      await expect(page2Link).toHaveAttribute('data-active', 'true')

      const page1Link = section.locator('[data-slot="pagination-link"]', { hasText: '1' })
      await expect(page1Link).toHaveAttribute('data-active', 'false')
    })

    test('clicking Next button updates active state', async ({ page }) => {
      const section = page.locator('[bf-s^="PaginationDynamicDemo_"]:not([data-slot])').first()

      const nextBtn = section.locator('a[aria-label="Go to next page"]')
      await nextBtn.click()

      const page2Link = section.locator('[data-slot="pagination-link"]', { hasText: '2' })
      await expect(page2Link).toHaveAttribute('data-active', 'true')
    })

    test('data-active and aria-current update reactively on page change', async ({ page }) => {
      const section = page.locator('[bf-s^="PaginationDynamicDemo_"]:not([data-slot])').first()

      const page1Link = section.locator('[data-slot="pagination-link"]', { hasText: '1' })
      const page3Link = section.locator('[data-slot="pagination-link"]', { hasText: '3' })

      // Initially page 1 is active
      await expect(page1Link).toHaveAttribute('data-active', 'true')
      await expect(page1Link).toHaveAttribute('aria-current', 'page')

      // Click page 3
      await page3Link.click()

      // Page 3 should become active, page 1 inactive
      await expect(page3Link).toHaveAttribute('data-active', 'true')
      await expect(page3Link).toHaveAttribute('aria-current', 'page')
      await expect(page1Link).toHaveAttribute('data-active', 'false')
    })

    test('has Previous and Next buttons', async ({ page }) => {
      const section = page.locator('[bf-s^="PaginationDynamicDemo_"]:not([data-slot])').first()
      await expect(section.locator('a[aria-label="Go to previous page"]')).toBeVisible()
      await expect(section.locator('a[aria-label="Go to next page"]')).toBeVisible()
    })

    test('has all 5 page links', async ({ page }) => {
      const section = page.locator('[bf-s^="PaginationDynamicDemo_"]:not([data-slot])').first()
      // Exclude Previous/Next which also have data-slot="pagination-link" with aria-label
      const pageLinks = section.locator('[data-slot="pagination-link"]:not([aria-label])')
      await expect(pageLinks).toHaveCount(5)
    })
  })

})
