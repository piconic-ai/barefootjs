import { test, expect } from '@playwright/test'

test.describe('DatePicker Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/date-picker')
  })

  test.describe('Preview', () => {
    // PreviewDemo renders DatePicker directly (no wrapper), so scope IS the data-slot element
    const previewScope = '[bf-s^="DatePickerPreviewDemo_"]'

    test('shows placeholder text when no date selected', async ({ page }) => {
      await expect(page.locator(`${previewScope} button:has-text("Pick a date")`)).toBeVisible()
    })

    test('opens calendar popover on click', async ({ page }) => {
      const trigger = page.locator(`${previewScope} button:has-text("Pick a date")`)
      await trigger.click()
      await expect(page.locator('[data-slot="popover-content"][data-state="open"]')).toBeVisible()
    })

    test('closes popover on ESC', async ({ page }) => {
      const trigger = page.locator(`${previewScope} button:has-text("Pick a date")`)
      await trigger.click()
      await expect(page.locator('[data-slot="popover-content"][data-state="open"]')).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(page.locator('[data-slot="popover-content"][data-state="open"]')).not.toBeVisible()
    })

    test('selects a date and closes popover', async ({ page }) => {
      const trigger = page.locator(`${previewScope} button:has-text("Pick a date")`)
      await trigger.click()

      const popover = page.locator('[data-slot="popover-content"][data-state="open"]')
      await expect(popover).toBeVisible()

      // Click the 15th day of the current month
      const dayButton = popover.locator('[data-slot="calendar"] button[data-current-month]:has-text("15")').first()
      await dayButton.click()

      // Popover should close after selection
      await expect(page.locator('[data-slot="popover-content"][data-state="open"]')).not.toBeVisible()

      // Preview trigger should now show a formatted date, not the placeholder
      await expect(page.locator(`${previewScope} button:has-text("Pick a date")`)).not.toBeVisible()
    })
  })

  test.describe('Basic', () => {
    const basicScope = '[bf-s^="DatePickerBasicDemo_"]'

    test('displays selected date text after selection', async ({ page }) => {
      // Initially shows "No date selected"
      await expect(page.locator('[data-testid="selected-date"]').first()).toContainText('No date selected')

      // Open the Basic demo's "Pick a date" picker
      const trigger = page.locator(`${basicScope} button:has-text("Pick a date")`)
      await trigger.click()

      const popover = page.locator('[data-slot="popover-content"][data-state="open"]')
      await expect(popover).toBeVisible()
      const dayButton = popover.locator('button:has-text("15")').first()
      await dayButton.click()

      // Should now show the selected date (no longer "No date selected")
      await expect(page.locator('[data-testid="selected-date"]').first()).not.toContainText('No date selected')
    })
  })

  test.describe('Form', () => {
    test('shows day count when both dates are selected', async ({ page }) => {
      // Select start date
      const startTrigger = page.locator('button:has-text("Select start date")')
      await startTrigger.click()

      let popover = page.locator('[data-slot="popover-content"][data-state="open"]')
      await popover.locator('[data-slot="calendar"] button[data-current-month]:has-text("5")').first().click()

      // Select end date
      const endTrigger = page.locator('button:has-text("Select end date")')
      await endTrigger.click()

      popover = page.locator('[data-slot="popover-content"][data-state="open"]')
      await popover.locator('[data-slot="calendar"] button[data-current-month]:has-text("10")').first().click()

      // Should show day count
      await expect(page.locator('[data-testid="day-count"]')).toContainText('day')
    })

    test('recalculates day count when end date is re-selected', async ({ page }) => {
      const formScope = '[bf-s^="DatePickerFormDemo_"]'
      const startPicker = page.locator(`${formScope} [data-slot="date-picker"]`).first()
      const endPicker = page.locator(`${formScope} [data-slot="date-picker"]`).nth(1)
      const dayCount = page.locator('[data-testid="day-count"]')

      // Select start date (5th)
      await startPicker.locator('button').click()
      let popover = page.locator('[data-slot="popover-content"][data-state="open"]')
      await popover.locator('[data-slot="calendar"] button[data-current-month]:has-text("5")').first().click()

      // Select end date (15th) → 10 days
      await endPicker.locator('button').click()
      popover = page.locator('[data-slot="popover-content"][data-state="open"]')
      await popover.locator('[data-slot="calendar"] button[data-current-month]:has-text("15")').first().click()

      await expect(dayCount).toContainText('10 days selected')

      // Verify End Date button shows the first end date
      await expect(endPicker.locator('button')).toContainText('15')

      // Re-select end date (8th) → 3 days
      await endPicker.locator('button').click()
      popover = page.locator('[data-slot="popover-content"][data-state="open"]')
      await popover.locator('[data-slot="calendar"] button[data-current-month]:has-text("8")').first().click()

      // Verify End Date button updated to new date
      await expect(endPicker.locator('button')).toContainText('8')

      await expect(dayCount).toContainText('3 days selected')
    })
  })

  test.describe('Date Range', () => {
    const rangeScope = '[bf-s^="DateRangePickerDemo_"]'

    test('shows placeholder when no range selected', async ({ page }) => {
      await expect(page.locator(`${rangeScope} button:has-text("Pick a date range")`)).toBeVisible()
    })

    test('displays range text after selection', async ({ page }) => {
      // Initially "No range selected"
      await expect(page.locator('[data-testid="range-text"]')).toContainText('No range selected')

      // Open picker
      const trigger = page.locator(`${rangeScope} button:has-text("Pick a date range")`)
      await trigger.click()

      const popover = page.locator('[data-slot="popover-content"][data-state="open"]')

      // Select start of range (5th)
      await popover.locator('[data-slot="calendar"] button[data-current-month]:has-text("5")').first().click()

      // Popover should stay open (range not complete)
      await expect(popover).toBeVisible()

      // Select end of range (20th)
      await popover.locator('[data-slot="calendar"] button[data-current-month]:has-text("20")').first().click()

      // Popover should close (range complete)
      await expect(page.locator('[data-slot="popover-content"][data-state="open"]')).not.toBeVisible()

      // Should show range text with dash
      await expect(page.locator('[data-testid="range-text"]')).toContainText('-')
    })
  })

  test.describe('Presets', () => {
    const presetsScope = '[bf-s^="DatePickerPresetsDemo_"]'

    test('preset button sets the date', async ({ page }) => {
      // Click "Today" preset button
      await page.locator(`${presetsScope} button[data-preset="0"]`).click()

      // DatePicker should no longer show "Select a date or preset" placeholder
      await expect(page.locator(`${presetsScope} [data-slot="date-picker"] button:has-text("Select a date or preset")`)).not.toBeVisible()
    })
  })
})
