import { test, expect } from '@playwright/test'

test.describe('Data Table Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/components/data-table')
  })

  test.describe('Sorting (Preview)', () => {
    test('renders table with sort buttons', async ({ page }) => {
      const sortButtons = page.locator('[data-slot="data-table-column-header"]')

      // Preview uses 2 sort buttons (Status, Amount), plus Sorting example reuses same demo = 4
      const count = await sortButtons.count()
      expect(count).toBeGreaterThanOrEqual(2)
    })

    test('clicking Amount header toggles between asc and desc', async ({ page }) => {
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

    test('clicking different column resets to unsorted', async ({ page }) => {
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

      // Type a filter that matches fewer rows
      await input.fill('ken')

      // Wait for reactive update
      await page.waitForTimeout(200)

      // The filtered table (second table) should show fewer rows
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

      await expect(pagination).toBeVisible()
    })

    test('navigating to next page and back preserves table rows', async ({ page }) => {
      // Find the first pagination component (filtering demo: 12 items, pageSize=5 → 3 pages)
      const pagination = page.locator('[data-slot="data-table-pagination"]').first()
      const nextBtn = pagination.locator('button', { hasText: 'Next' })
      const prevBtn = pagination.locator('button', { hasText: 'Previous' })

      // Should start on page 1
      await expect(pagination).toContainText('Page 1 of 3')

      // Navigate to page 2
      await nextBtn.click()
      await expect(pagination).toContainText('Page 2 of 3')

      // Navigate back to page 1
      await prevBtn.click()
      await expect(pagination).toContainText('Page 1 of 3')

      // Table body should still have rows
      const table = pagination.locator('..').locator('[data-slot="table-body"] [data-slot="table-row"]')
      const rowCount = await table.count()
      expect(rowCount).toBeGreaterThan(0)
    })
  })

  test.describe('Row Selection', () => {
    test('renders checkboxes', async ({ page }) => {
      // The selection demo has checkboxes (select-all + rows)
      const checkboxes = page.locator('button[role="checkbox"]')
      const count = await checkboxes.count()
      expect(count).toBeGreaterThanOrEqual(6) // 1 select-all + 5 rows
    })

    test('clicking row checkbox selects it', async ({ page }) => {
      // Find the checkboxes in the selection demo (last group of checkboxes)
      const allCheckboxes = page.locator('button[role="checkbox"]')
      const totalCount = await allCheckboxes.count()

      // Click the second-to-last group's first non-select-all checkbox
      // The selection demo's checkboxes are the last 6 (1 header + 5 rows)
      const rowCheckbox = allCheckboxes.nth(totalCount - 5) // First row checkbox in selection demo

      await rowCheckbox.click()

      // Should show "1 of 5 row(s) selected."
      await expect(page.locator('text=1 of 5 row(s) selected.')).toBeVisible()
    })

    test('select-all checkbox toggles all rows', async ({ page }) => {
      const allCheckboxes = page.locator('button[role="checkbox"]')
      const totalCount = await allCheckboxes.count()

      // Select-all checkbox is the first one in the selection demo group
      const selectAll = allCheckboxes.nth(totalCount - 6)

      // Click select all
      await selectAll.click()

      // Should show "5 of 5 row(s) selected."
      await expect(page.locator('text=5 of 5 row(s) selected.')).toBeVisible()

      // Click again to deselect all
      await selectAll.click()
      await expect(page.locator('text=0 of 5 row(s) selected.')).toBeVisible()
    })
  })
})
