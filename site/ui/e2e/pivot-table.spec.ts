import { test, expect } from '@playwright/test'

test.describe('Pivot Table Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/pivot-table')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="PivotTableDemo_"]:not([data-slot])').first()

  test.describe('Initial Render', () => {
    test('renders four axis zones', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.axis-zone-available')).toBeVisible()
      await expect(s.locator('.axis-zone-rows')).toBeVisible()
      await expect(s.locator('.axis-zone-columns')).toBeVisible()
      await expect(s.locator('.axis-zone-values')).toBeVisible()
    })

    test('shows default row fields (Region, Product) in rows zone', async ({ page }) => {
      const s = section(page)
      const rowsZone = s.locator('.axis-zone-rows')
      await expect(rowsZone.locator('.pivot-field-region')).toBeVisible()
      await expect(rowsZone.locator('.pivot-field-product')).toBeVisible()
    })

    test('shows default column field (Quarter) in columns zone', async ({ page }) => {
      const s = section(page)
      const colsZone = s.locator('.axis-zone-columns')
      await expect(colsZone.locator('.pivot-field-quarter')).toBeVisible()
    })

    test('shows default value field (Amount) in values zone', async ({ page }) => {
      const s = section(page)
      const valZone = s.locator('.axis-zone-values')
      await expect(valZone.locator('.pivot-field-amount')).toBeVisible()
    })

    test('renders column headers Q1, Q2, Q3, Q4, Total', async ({ page }) => {
      const s = section(page)
      const headers = s.locator('.pivot-header')
      await expect(headers).toHaveCount(5)
      await expect(headers.nth(0)).toContainText('Q1')
      await expect(headers.nth(1)).toContainText('Q2')
      await expect(headers.nth(2)).toContainText('Q3')
      await expect(headers.nth(3)).toContainText('Q4')
      await expect(headers.nth(4)).toContainText('Total')
    })

    test('renders regional group rows', async ({ page }) => {
      const s = section(page)
      const groupRows = s.locator('.pivot-group-row')
      // 4 regions expanded + 4 products under each = many group rows
      await expect(groupRows.first()).toBeVisible()
    })

    test('shows record count badge', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.record-count')).toContainText('16 records')
    })

    test('shows grand total row', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.pivot-total-row')).toBeVisible()
      await expect(s.locator('.pivot-total-row')).toContainText('Grand Total')
    })

    test('aggregation defaults to sum', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.pivot-stats')).toContainText('sum')
    })
  })

  test.describe('Expand/Collapse', () => {
    test('top-level groups are initially expanded showing product sub-groups', async ({ page }) => {
      const s = section(page)
      // With default: region expanded → product sub-rows visible
      // We should see both group rows (regions) and child group rows (products)
      const allRows = s.locator('.pivot-row')
      const count = await allRows.count()
      // 4 regions + at least some products = more than 4 rows
      expect(count).toBeGreaterThan(4)
    })

    test('clicking collapse on North hides its product sub-groups', async ({ page }) => {
      const s = section(page)
      const rows = s.locator('.pivot-row')
      const countBefore = await rows.count()

      // Find North expand button (first group row)
      const northRow = s.locator('.pivot-group-row').first()
      await northRow.locator('.pivot-expand-btn').click()

      const countAfter = await rows.count()
      expect(countAfter).toBeLessThan(countBefore)
    })

    test('clicking expand on collapsed group shows children', async ({ page }) => {
      const s = section(page)

      // Collapse first group
      const firstGroupRow = s.locator('.pivot-group-row').first()
      await firstGroupRow.locator('.pivot-expand-btn').click()
      const countCollapsed = await s.locator('.pivot-row').count()

      // Expand it again
      await firstGroupRow.locator('.pivot-expand-btn').click()
      const countExpanded = await s.locator('.pivot-row').count()

      expect(countExpanded).toBeGreaterThan(countCollapsed)
    })

    test('visible row count badge updates on collapse', async ({ page }) => {
      const s = section(page)
      const badge = s.locator('.group-count')
      const initialText = await badge.textContent()

      // Collapse first group (hides child rows from visible count)
      const firstGroupRow = s.locator('.pivot-group-row').first()
      await firstGroupRow.locator('.pivot-expand-btn').click()

      const updatedText = await badge.textContent()
      expect(updatedText).not.toBe(initialText)
    })
  })

  test.describe('Aggregation Switching', () => {
    test('switching to Count changes cell values', async ({ page }) => {
      const s = section(page)

      // Check row total cell (reactive via createEffect)
      const rowTotal = s.locator('.pivot-row-total').first()
      const valueBefore = await rowTotal.textContent()

      // Switch to count
      await s.locator('.agg-select button[role="combobox"]').click()
      await page.locator('[role="option"]').filter({ hasText: 'Count' }).click()

      const valueAfter = await rowTotal.textContent()
      expect(valueAfter).not.toBe(valueBefore)
    })

    test('switching to Average changes cell values', async ({ page }) => {
      const s = section(page)

      const rowTotal = s.locator('.pivot-row-total').first()
      const valueBefore = await rowTotal.textContent()

      await s.locator('.agg-select button[role="combobox"]').click()
      await page.locator('[role="option"]').filter({ hasText: 'Average' }).click()

      const valueAfter = await rowTotal.textContent()
      expect(valueAfter).not.toBe(valueBefore)
    })

    test('grand total updates when aggregation changes', async ({ page }) => {
      const s = section(page)

      const totalCell = s.locator('.pivot-total-cell').last()
      const totalBefore = await totalCell.textContent()

      await s.locator('.agg-select button[role="combobox"]').click()
      await page.locator('[role="option"]').filter({ hasText: 'Count' }).click()

      const totalAfter = await totalCell.textContent()
      expect(totalAfter).not.toBe(totalBefore)
    })

    test('stats footer shows current aggregation function', async ({ page }) => {
      const s = section(page)

      await s.locator('.agg-select button[role="combobox"]').click()
      await page.locator('[role="option"]').filter({ hasText: 'Average' }).click()

      await expect(s.locator('.pivot-stats')).toContainText('avg')
    })
  })

  test.describe('Axis Reconfiguration', () => {
    test('removing a row field via X button simplifies grouping', async ({ page }) => {
      const s = section(page)

      const rowsBefore = await s.locator('.pivot-row').count()

      // Remove "Product" field from rows axis
      const productBadge = s.locator('.axis-zone-rows .pivot-field-product')
      await productBadge.locator('.field-remove-btn').click()

      const rowsAfter = await s.locator('.pivot-row').count()
      // Fewer rows because one level of grouping is removed
      expect(rowsAfter).toBeLessThanOrEqual(rowsBefore)
    })

    test('removed field appears in available zone', async ({ page }) => {
      const s = section(page)

      // Product is in rows initially
      await expect(s.locator('.axis-zone-available .pivot-field-product')).not.toBeVisible()

      // Remove it
      await s.locator('.axis-zone-rows .pivot-field-product .field-remove-btn').click()

      // Should now appear in available
      await expect(s.locator('.axis-zone-available .pivot-field-product')).toBeVisible()
    })

    test('removing column field shows only Total column', async ({ page }) => {
      const s = section(page)

      // Remove Quarter from columns
      await s.locator('.axis-zone-columns .pivot-field-quarter .field-remove-btn').click()

      // Should have only the Total header now (no Q1-Q4)
      const headers = s.locator('.pivot-header')
      await expect(headers).toHaveCount(1)
      await expect(headers.first()).toContainText('Total')
    })

    test('column field removal returns field to available zone', async ({ page }) => {
      const s = section(page)

      await s.locator('.axis-zone-columns .pivot-field-quarter .field-remove-btn').click()
      await expect(s.locator('.axis-zone-available .pivot-field-quarter')).toBeVisible()
    })

    test('dragging available field into rows shows X button on new field', async ({ page }) => {
      const s = section(page)

      // Rows starts with [region, product] (max 2). Remove one to make room.
      await s.locator('.axis-zone-rows .pivot-field-region .field-remove-btn').click()

      // Salesperson is now available — drag it into Rows
      const source = s.locator('.axis-zone-available .pivot-field-salesperson')
      const target = s.locator('.axis-zone-rows')
      await source.dragTo(target)

      // Salesperson should now appear in Rows zone with a remove button
      const newField = s.locator('.axis-zone-rows .pivot-field-salesperson')
      await expect(newField).toBeVisible()
      await expect(newField.locator('.field-remove-btn')).toBeVisible()
    })

    test('re-adding a removed field to rows shows X button', async ({ page }) => {
      const s = section(page)

      // Remove Product from rows → it moves to Available
      await s.locator('.axis-zone-rows .pivot-field-product .field-remove-btn').click()
      await expect(s.locator('.axis-zone-available .pivot-field-product')).toBeVisible()

      // Drag Product back into rows
      const source = s.locator('.axis-zone-available .pivot-field-product')
      const target = s.locator('.axis-zone-rows')
      await source.dragTo(target)

      // X button must be visible on the re-added field
      const newField = s.locator('.axis-zone-rows .pivot-field-product')
      await expect(newField).toBeVisible()
      await expect(newField.locator('.field-remove-btn')).toBeVisible()
    })
  })

  test.describe('Grand Totals', () => {
    test('grand total row is always visible', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.pivot-total-row')).toBeVisible()
    })

    test('grand total has cells for each column plus Total', async ({ page }) => {
      const s = section(page)
      const totalCells = s.locator('.pivot-total-cell')
      // 4 quarters + 1 Total = 5 cells
      await expect(totalCells).toHaveCount(5)
    })

    test('grand total updates after removing column field', async ({ page }) => {
      const s = section(page)

      const totalCellsBefore = await s.locator('.pivot-total-cell').count()

      await s.locator('.axis-zone-columns .pivot-field-quarter .field-remove-btn').click()

      const totalCellsAfter = await s.locator('.pivot-total-cell').count()
      // Should have fewer cells (only Total)
      expect(totalCellsAfter).toBeLessThan(totalCellsBefore)
    })
  })
})
