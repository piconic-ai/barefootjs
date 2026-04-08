import { test, expect } from '@playwright/test'

test.describe('Analytics Dashboard Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/analytics-dashboard')
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

    test('KPI values update when source filter changes', async ({ page }) => {
      const s = section(page)
      const viewsBefore = await s.locator('.kpi-views').textContent()

      // Filter to "organic" only
      await s.locator('.source-filter').click()
      await page.locator('[data-slot="select-item"]:has-text("Organic")').click()

      const viewsAfter = await s.locator('.kpi-views').textContent()
      expect(viewsBefore).not.toBe(viewsAfter)
    })
  })

  test.describe('Source Filter (memo chain)', () => {
    test('subtitle shows correct count', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.analytics-subtitle')).toContainText('20 of 20 pages')
    })

    test('selecting source filters and updates subtitle', async ({ page }) => {
      const s = section(page)
      await s.locator('.source-filter').click()
      await page.locator('[data-slot="select-item"]:has-text("Organic")').click()

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
    test('clicking Views header sorts by views', async ({ page }) => {
      const s = section(page)
      await s.locator('th:has-text("Views")').click()

      // First row should have the smallest view count
      const firstViews = await s.locator('.analytics-row').first().locator('td').nth(2).textContent()
      await s.locator('th:has-text("Views")').click() // desc
      const firstViewsDesc = await s.locator('.analytics-row').first().locator('td').nth(2).textContent()

      expect(firstViews).not.toBe(firstViewsDesc)
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

    test('next page updates page info', async ({ page }) => {
      const s = section(page)

      await expect(s.locator('.analytics-page-info')).toContainText('Page 1')
      await s.locator('button:has-text("Next")').click()
      await expect(s.locator('.analytics-page-info')).toContainText('Page 2')
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

    test('footer updates when filter changes', async ({ page }) => {
      const s = section(page)
      const footerBefore = await s.locator('.analytics-footer').textContent()

      await s.locator('.source-filter').click()
      await page.locator('[data-slot="select-item"]:has-text("Paid")').click()

      const footerAfter = await s.locator('.analytics-footer').textContent()
      expect(footerBefore).not.toBe(footerAfter)
    })
  })
})
