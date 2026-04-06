import { test, expect } from '@playwright/test'

test.describe('Data Table Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/data-table')
  })

  test('renders page header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Data Table')
  })

  test('renders sortable column headers', async ({ page }) => {
    await expect(page.locator('[data-slot="data-table-column-header"]').first()).toBeVisible()
  })

  test('renders API reference section', async ({ page }) => {
    await expect(page.locator('#api-reference')).toBeVisible()
  })

  test.describe('Sorting (Preview)', () => {
    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('clicking Amount header toggles between asc and desc', async ({ page }) => {
      const amountHeader = page.locator('[data-slot="data-table-column-header"]').filter({ hasText: 'Amount' }).first()

      const firstTable = page.locator('[data-slot="table"]').first()
      const rows = firstTable.locator('[data-slot="table-body"] [data-slot="table-row"]')
      const firstAmountCell = rows.first().locator('[data-slot="table-cell"]').last()

      // Original unsorted order
      await expect(firstAmountCell).toHaveText('$316.00')

      // Click 1: asc
      await amountHeader.click()
      await expect(firstAmountCell).toHaveText('$242.00')

      // Click 2: desc
      await amountHeader.click()
      await expect(firstAmountCell).toHaveText('$874.00')

      // Click 3: back to asc (not unsorted)
      await amountHeader.click()
      await expect(firstAmountCell).toHaveText('$242.00')
    })

    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('clicking different column resets to unsorted', async ({ page }) => {
      const amountHeader = page.locator('[data-slot="data-table-column-header"]').filter({ hasText: 'Amount' }).first()
      const statusHeader = page.locator('[data-slot="data-table-column-header"]').filter({ hasText: 'Status' }).first()

      const firstTable = page.locator('[data-slot="table"]').first()
      const rows = firstTable.locator('[data-slot="table-body"] [data-slot="table-row"]')
      const firstAmountCell = rows.first().locator('[data-slot="table-cell"]').last()

      // Sort Amount ascending
      await amountHeader.click()
      await expect(firstAmountCell).toHaveText('$242.00')

      // Click Status — resets to unsorted (original order)
      await statusHeader.click()
      await expect(firstAmountCell).toHaveText('$316.00')
    })
  })

  test.describe('Filtering', () => {
    test('renders filter input', async ({ page }) => {
      const input = page.locator('input[placeholder="Filter emails..."]')
      await expect(input).toBeVisible()
    })

    test('filtering narrows displayed rows', async ({ page }) => {
      const input = page.locator('input[placeholder="Filter emails..."]')

      await input.fill('ken')
      await page.waitForTimeout(200)

      const filteringSection = input.locator('..')
      const rows = filteringSection.locator('[data-slot="table-body"] [data-slot="table-row"]')
      const count = await rows.count()
      expect(count).toBeLessThanOrEqual(5)
      expect(count).toBeGreaterThan(0)
    })
  })

  test.describe('Pagination', () => {
    test('pagination controls are visible', async ({ page }) => {
      const pagination = page.locator('[data-slot="data-table-pagination"]')
      await expect(pagination.first()).toBeVisible()
    })

    test('navigating to next page and back', async ({ page }) => {
      const pagination = page.locator('[data-slot="data-table-pagination"]').first()
      const nextBtn = pagination.locator('button', { hasText: 'Next' })
      const prevBtn = pagination.locator('button', { hasText: 'Previous' })

      // Usage demo: 5 items, pageSize=3 → 2 pages
      await expect(pagination).toContainText('Page 1 of 2')

      await nextBtn.click()
      await expect(pagination).toContainText('Page 2 of 2')

      await prevBtn.click()
      await expect(pagination).toContainText('Page 1 of 2')
    })
  })

  test.describe('Row Selection', () => {
    test('renders checkboxes', async ({ page }) => {
      const checkboxes = page.locator('button[role="checkbox"]')
      const count = await checkboxes.count()
      expect(count).toBeGreaterThanOrEqual(6) // 1 select-all + 5 rows
    })

    test('clicking row checkbox selects it', async ({ page }) => {
      const allCheckboxes = page.locator('button[role="checkbox"]')
      const totalCount = await allCheckboxes.count()

      // The selection demo's checkboxes are the last 6 (1 header + 5 rows)
      const rowCheckbox = allCheckboxes.nth(totalCount - 5) // First row checkbox
      await rowCheckbox.click()

      await expect(page.locator('text=1 of 5 row(s) selected.')).toBeVisible()
    })

    test('select-all checkbox toggles all rows', async ({ page }) => {
      const allCheckboxes = page.locator('button[role="checkbox"]')
      const totalCount = await allCheckboxes.count()

      const selectAll = allCheckboxes.nth(totalCount - 6)

      await selectAll.click()
      await expect(page.locator('text=5 of 5 row(s) selected.')).toBeVisible()

      await selectAll.click()
      await expect(page.locator('text=0 of 5 row(s) selected.')).toBeVisible()
    })
  })
})
