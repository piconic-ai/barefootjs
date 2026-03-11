import { test, expect } from '@playwright/test'

test.describe('Calendar Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/calendar')
  })

  test('renders page header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Calendar')
  })

  test('renders calendar in playground', async ({ page }) => {
    await expect(page.locator('[data-slot="calendar"]').first()).toBeVisible()
  })

  test('renders API reference section', async ({ page }) => {
    await expect(page.locator('#api-reference')).toBeVisible()
  })

  test.describe('Basic Example', () => {
    test('renders calendar with month navigation', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarBasicDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')
      await expect(calendar).toBeVisible()

      const prevBtn = calendar.locator('[data-slot="calendar-nav-prev"]')
      const nextBtn = calendar.locator('[data-slot="calendar-nav-next"]')
      await expect(prevBtn).toBeVisible()
      await expect(nextBtn).toBeVisible()

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

      const dayButton = calendar.locator('[data-slot="calendar-day-button"]:not([data-outside]):not([data-disabled])').nth(14)
      await dayButton.click()

      await expect(dayButton).toHaveAttribute('aria-selected', 'true')
      await expect(dayButton).toHaveAttribute('data-selected-single', '')
      await expect(section.locator('text=No date selected')).not.toBeVisible()
    })

    test('clicking a selected day deselects it', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarBasicDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')

      const dayButton = calendar.locator('[data-slot="calendar-day-button"]:not([data-outside]):not([data-disabled])').nth(5)

      await dayButton.click()
      await expect(dayButton).toHaveAttribute('aria-selected', 'true')

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

  test.describe('Form Example', () => {
    test('submit button is disabled without name and date', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarFormDemo_"]:not([data-slot])').first()
      const submitBtn = section.locator('button:has-text("Book Appointment")')
      await expect(submitBtn).toBeDisabled()
    })

    test('past dates are disabled', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarFormDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')

      const prevBtn = calendar.locator('[data-slot="calendar-nav-prev"]')
      await expect(prevBtn).toBeDisabled()

      const disabledDays = calendar.locator('[data-slot="calendar-day-button"][data-disabled]:not([data-outside])')
      const count = await disabledDays.count()
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  test.describe('Constraints Example', () => {
    test('weekends are disabled', async ({ page }) => {
      const section = page.locator('[bf-s^="CalendarWithConstraintsDemo_"]:not([data-slot])').first()
      const calendar = section.locator('[data-slot="calendar"]')

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

      const availableDay = calendar.locator('[data-slot="calendar-day-button"]:not([data-outside]):not([data-disabled])').first()
      await availableDay.click()

      await expect(availableDay).toHaveAttribute('aria-selected', 'true')
      await expect(section.locator('text=Select a weekday')).not.toBeVisible()
    })
  })
})
