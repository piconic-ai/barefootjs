import { test, expect } from '@playwright/test'

test.describe('Spreadsheet Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/spreadsheet')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="SpreadsheetDemo_"]:not([data-slot])').first()

  test.describe('Initial Render', () => {
    test('renders 5 rows', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.spreadsheet-row')).toHaveCount(5)
    })

    test('renders column headers', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.col-header')).toHaveCount(4)
    })

    test('renders cell values', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.cell-value').first()).toContainText('Product')
    })

    test('renders computed formula D2 = B2 * C2', async ({ page }) => {
      const s = section(page)
      const row2 = s.locator('.spreadsheet-row').nth(1)
      const d2 = row2.locator('.spreadsheet-cell').nth(3)
      await expect(d2.locator('.cell-value')).toContainText('299.9')
    })

    test('renders SUM formula D5', async ({ page }) => {
      const s = section(page)
      const row5 = s.locator('.spreadsheet-row').nth(4)
      const d5 = row5.locator('.spreadsheet-cell').nth(3)
      await expect(d5.locator('.cell-value')).toContainText('749.65')
    })

    test('shows filled cell count', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.filled-count')).toBeVisible()
    })
  })

  test.describe('Cell Selection', () => {
    test('clicking cell shows ref in formula bar', async ({ page }) => {
      const s = section(page)
      await s.locator('.spreadsheet-row').first().locator('.spreadsheet-cell').first().click()
      await expect(s.locator('.cell-ref')).toContainText('A1')
    })

    test('clicking different cell updates ref', async ({ page }) => {
      const s = section(page)
      await s.locator('.spreadsheet-row').nth(1).locator('.spreadsheet-cell').nth(1).click()
      await expect(s.locator('.cell-ref')).toContainText('B2')
    })
  })

  test.describe('Cell Editing (Formula Bar)', () => {
    test('clicking formula bar enters edit mode', async ({ page }) => {
      const s = section(page)
      await s.locator('.spreadsheet-row').nth(1).locator('.spreadsheet-cell').first().click()
      await s.locator('.cell-formula').click()
      await expect(s.locator('.cell-input')).toBeVisible()
    })

    test('editing and pressing Enter commits value', async ({ page }) => {
      const s = section(page)
      const row2 = s.locator('.spreadsheet-row').nth(1)
      const a2 = row2.locator('.spreadsheet-cell').first()
      await a2.click()
      await s.locator('.cell-formula').click()
      await s.locator('.cell-input').fill('NewProduct')
      await s.locator('.cell-input').press('Enter')
      await expect(a2.locator('.cell-value')).toContainText('NewProduct')
    })

    test('pressing Escape cancels edit', async ({ page }) => {
      const s = section(page)
      const row2 = s.locator('.spreadsheet-row').nth(1)
      const a2 = row2.locator('.spreadsheet-cell').first()
      await a2.click()
      await s.locator('.cell-formula').click()
      await s.locator('.cell-input').fill('Cancelled')
      await s.locator('.cell-input').press('Escape')
      await expect(a2.locator('.cell-value')).toContainText('Widget')
    })
  })

  test.describe('Formula Evaluation', () => {
    test('editing quantity updates total', async ({ page }) => {
      const s = section(page)
      await s.locator('.spreadsheet-row').nth(1).locator('.spreadsheet-cell').nth(2).click()
      await s.locator('.cell-formula').click()
      await s.locator('.cell-input').fill('20')
      await s.locator('.cell-input').press('Enter')
      // D2 = B2 * C2 = 29.99 * 20 = 599.8
      const d2 = s.locator('.spreadsheet-row').nth(1).locator('.spreadsheet-cell').nth(3)
      await expect(d2.locator('.cell-value')).toContainText('599.8')
    })
  })

  test.describe('Clear Cell', () => {
    test('clear button empties selected cell', async ({ page }) => {
      const s = section(page)
      await s.locator('.spreadsheet-row').nth(1).locator('.spreadsheet-cell').first().click()
      await s.locator('.clear-btn').click()
      const a2 = s.locator('.spreadsheet-row').nth(1).locator('.spreadsheet-cell').first()
      const text = await a2.locator('.cell-value').textContent()
      expect(text?.trim()).toBe('')
    })

    test('clear button is disabled without selection', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.clear-btn')).toBeDisabled()
    })
  })
})
