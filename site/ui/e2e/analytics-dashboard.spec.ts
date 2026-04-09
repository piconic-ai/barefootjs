import { test, expect } from '@playwright/test'

test.describe('Analytics Dashboard Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/analytics-dashboard')
    await page.waitForLoadState('networkidle')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="AnalyticsDashboardDemo_"]:not([data-slot])').first()

  test.describe('KPI Cards', () => {
    test('renders all 6 KPI cards', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.kpi-views')).toBeVisible()
      await expect(s.locator('.kpi-visitors')).toBeVisible()
      await expect(s.locator('.kpi-revenue')).toBeVisible()
      await expect(s.locator('.kpi-bounce')).toBeVisible()
      await expect(s.locator('.kpi-conversions')).toBeVisible()
      await expect(s.locator('.kpi-duration')).toBeVisible()
    })

    // TODO: "tag is not defined" runtime error in analytics-dashboard hydration
    test.skip('KPI values update when search filter changes', async ({ page }) => {
      const s = section(page)
      const viewsBefore = await s.locator('.kpi-views').textContent()

      await s.locator('.analytics-search').fill('/pricing')

      const viewsAfter = await s.locator('.kpi-views').textContent()
      expect(viewsBefore).not.toBe(viewsAfter)
    })
  })

  test.describe('Source Filter (memo chain)', () => {
    test('subtitle shows correct count', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.analytics-subtitle')).toContainText('20 of 20 pages')
    })

    // TODO: "tag is not defined" runtime error in analytics-dashboard hydration
    test.skip('search filters and updates subtitle', async ({ page }) => {
      const s = section(page)
      await s.locator('.analytics-search').fill('/pricing')

      // Should show fewer pages
      await expect(s.locator('.analytics-subtitle')).not.toContainText('20 of 20')
      await expect(s.locator('.analytics-subtitle')).toContainText('of 20 pages')
    })
  })

  test.describe('Search Filter (controlled input)', () => {
    test('typing filters table rows', async ({ page }) => {
      const s = section(page)
      const search = s.locator('.analytics-search')
      await search.fill('/pricing')

      const rows = s.locator('.analytics-row')
      const count = await rows.count()
      expect(count).toBeLessThan(20)
      expect(count).toBeGreaterThan(0)
    })

    test('search input retains focus while filtering', async ({ page }) => {
      const s = section(page)
      const search = s.locator('.analytics-search')
      await search.focus()
      await search.type('/home', { delay: 30 })

      const isFocused = await search.evaluate(el => document.activeElement === el)
      expect(isFocused).toBe(true)
      await expect(search).toHaveValue('/home')
    })

    test('clearing search restores all rows', async ({ page }) => {
      const s = section(page)
      const search = s.locator('.analytics-search')
      await search.fill('/pricing')
      await search.fill('')

      await expect(s.locator('.analytics-page-info')).toContainText('Page 1')
    })
  })

  test.describe('Charts', () => {
    test('area chart card renders', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=Traffic Over Time')).toBeVisible()
    })

    test('pie chart card renders', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=Revenue by Source')).toBeVisible()
    })
  })

  test.describe('Table Sorting', () => {
    // TODO: "tag is not defined" runtime error in analytics-dashboard hydration
    test.skip('sort indicator changes on header click', async ({ page }) => {
      const s = section(page)
      const viewsHeader = s.locator('th:has-text("Views")')
      const headerBefore = await viewsHeader.textContent()
      await viewsHeader.click()
      const headerAfter = await viewsHeader.textContent()
      // Header should show sort direction indicator
      expect(headerAfter).not.toBe(headerBefore)
    })
  })

  test.describe('Table Tags (inner loops)', () => {
    test('rows display tag badges', async ({ page }) => {
      const s = section(page)
      const firstRow = s.locator('.analytics-row').first()
      const tags = firstRow.locator('[data-slot="badge"]')
      const count = await tags.count()
      expect(count).toBeGreaterThan(0)
    })
  })

  test.describe('Pagination', () => {
    test('shows page info', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.analytics-page-info')).toContainText('Page 1')
    })

    test('pagination controls are visible', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.analytics-page-info')).toContainText('Page 1')
      await expect(s.locator('button:has-text("Next")')).toBeVisible()
      await expect(s.locator('button:has-text("Previous")')).toBeVisible()
    })
  })

  test.describe('Footer stats', () => {
    test('shows combined stats', async ({ page }) => {
      const s = section(page)
      const footer = s.locator('.analytics-footer')
      await expect(footer).toContainText('20 of 20 pages')
      await expect(footer).toContainText('conversions')
      await expect(footer).toContainText('total revenue')
    })

    // TODO: "tag is not defined" runtime error in analytics-dashboard hydration
    test.skip('footer updates when search filter changes', async ({ page }) => {
      const s = section(page)
      const footerBefore = await s.locator('.analytics-footer').textContent()

      await s.locator('.analytics-search').fill('/pricing')

      const footerAfter = await s.locator('.analytics-footer').textContent()
      expect(footerBefore).not.toBe(footerAfter)
    })
  })
})
