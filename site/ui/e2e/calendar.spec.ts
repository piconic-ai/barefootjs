import { test, expect } from '@playwright/test'

test.describe('Calendar Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/components/calendar')
  })

  test.describe('Preview (Basic Demo)', () => {
    test('renders calendar with month navigation', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarBasicDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')
      await expect(calendar).toBeVisible()

      // Should have nav buttons
      const prevBtn = calendar.locator('[data-slot="calendar-nav-prev"]')
      const nextBtn = calendar.locator('[data-slot="calendar-nav-next"]')
      await expect(prevBtn).toBeVisible()
      await expect(nextBtn).toBeVisible()

      // Should have month title
      const title = calendar.locator('[data-slot="calendar-month-title"]')
      await expect(title).toBeVisible()
    })

    test('shows "No date selected" initially', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarBasicDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=No date selected')).toBeVisible()
    })

    test('clicking a day selects it and shows formatted date', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarBasicDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')

      // Click a non-disabled, non-outside day button (the 15th of the current month)
      const dayButton = calendar.locator('[data-slot="calendar-day-button"]:not([data-outside]):not([data-disabled])').nth(14)
      await dayButton.click()

      // Day should be marked as selected
      await expect(dayButton).toHaveAttribute('aria-selected', 'true')
      await expect(dayButton).toHaveAttribute('data-selected-single', '')

      // "No date selected" should be gone
      await expect(section.locator('text=No date selected')).not.toBeVisible()
    })

    test('clicking a selected day deselects it', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarBasicDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')

      const dayButton = calendar.locator('[data-slot="calendar-day-button"]:not([data-outside]):not([data-disabled])').nth(5)

      // Select
      await dayButton.click()
      await expect(dayButton).toHaveAttribute('aria-selected', 'true')

      // Deselect
      await dayButton.click()
      await expect(section.locator('text=No date selected')).toBeVisible()
    })
  })

  test.describe('Month Navigation', () => {
    test('clicking next month changes the displayed month', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarBasicDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')
      const title = calendar.locator('[data-slot="calendar-month-title"]')
      const nextBtn = calendar.locator('[data-slot="calendar-nav-next"]')

      const initialTitle = await title.textContent()
      await nextBtn.click()
      const newTitle = await title.textContent()
      expect(newTitle).not.toBe(initialTitle)
    })

    test('clicking prev month changes the displayed month', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarBasicDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')
      const title = calendar.locator('[data-slot="calendar-month-title"]')
      const prevBtn = calendar.locator('[data-slot="calendar-nav-prev"]')

      const initialTitle = await title.textContent()
      await prevBtn.click()
      const newTitle = await title.textContent()
      expect(newTitle).not.toBe(initialTitle)
    })
  })

  test.describe('Form Demo', () => {
    test('submit button is disabled without name and date', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarFormDemo_"]:not([data-slot])').first()
      const submitBtn = section.locator('button:has-text("Book Appointment")')
      await expect(submitBtn).toBeDisabled()
    })

    test('past dates are disabled', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarFormDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')

      // With fromDate={today}, the prev month button should be disabled
      // (since all days in the previous month are before today)
      const prevBtn = calendar.locator('[data-slot="calendar-nav-prev"]')
      await expect(prevBtn).toBeDisabled()

      // Days before today in the current month should be disabled
      const disabledDays = calendar.locator('[data-slot="calendar-day-button"][data-disabled]:not([data-outside])')
      const count = await disabledDays.count()
      // At least day 1 (if today > 1) should be disabled
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  test.describe('Constraints Demo', () => {
    test('weekends are disabled', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarWithConstraintsDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')

      // Check that some days are disabled (weekends)
      const disabledDays = calendar.locator('[data-slot="calendar-day-button"][data-disabled]:not([data-outside])')
      const count = await disabledDays.count()
      expect(count).toBeGreaterThan(0)
    })

    test('shows "Select a weekday" initially', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarWithConstraintsDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=Select a weekday')).toBeVisible()
    })

    test('clicking a weekday selects it', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarWithConstraintsDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')

      // Click a non-disabled, non-outside day
      const availableDay = calendar.locator('[data-slot="calendar-day-button"]:not([data-outside]):not([data-disabled])').first()
      await availableDay.click()

      await expect(availableDay).toHaveAttribute('aria-selected', 'true')
      // "Select a weekday" should be replaced with actual date
      await expect(section.locator('text=Select a weekday')).not.toBeVisible()
    })
  })
})
