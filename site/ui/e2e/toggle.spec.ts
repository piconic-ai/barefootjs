import { test, expect } from '@playwright/test'

test.describe('Toggle Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/toggle')
  })

  test.describe('Toggle Rendering', () => {
    test('displays toggle elements with data-slot', async ({ page }) => {
      const toggles = page.locator('[data-slot="toggle"]')
      await expect(toggles.first()).toBeVisible()
    })

    test('has multiple toggle examples', async ({ page }) => {
      const toggles = page.locator('[data-slot="toggle"]')
      expect(await toggles.count()).toBeGreaterThan(3)
    })
  })

  test.describe('Basic', () => {
    test('displays basic example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Basic")')).toBeVisible()
      const section = page.locator('[bf-s^="ToggleBasicDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('has three toggles', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleBasicDemo_"]:not([data-slot])').first()
      const toggles = section.locator('[data-slot="toggle"]')
      await expect(toggles).toHaveCount(3)
    })

    test('first toggle starts unpressed', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleBasicDemo_"]:not([data-slot])').first()
      const toggles = section.locator('[data-slot="toggle"]')
      await expect(toggles.first()).toHaveAttribute('aria-pressed', 'false')
      await expect(toggles.first()).toHaveAttribute('data-state', 'off')
    })

    test('second toggle starts pressed (defaultPressed)', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleBasicDemo_"]:not([data-slot])').first()
      const toggles = section.locator('[data-slot="toggle"]')
      await expect(toggles.nth(1)).toHaveAttribute('aria-pressed', 'true')
      await expect(toggles.nth(1)).toHaveAttribute('data-state', 'on')
    })

    test('third toggle is disabled', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleBasicDemo_"]:not([data-slot])').first()
      const toggles = section.locator('[data-slot="toggle"]')
      await expect(toggles.nth(2)).toBeDisabled()
    })

    test('clicking toggles aria-pressed and data-state', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleBasicDemo_"]:not([data-slot])').first()
      const toggle = section.locator('[data-slot="toggle"]').first()

      // Initially unpressed
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await expect(toggle).toHaveAttribute('data-state', 'off')

      // Click to press
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await expect(toggle).toHaveAttribute('data-state', 'on')

      // Click to unpress
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await expect(toggle).toHaveAttribute('data-state', 'off')
    })
  })

  test.describe('Outline', () => {
    test('displays outline example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Outline")')).toBeVisible()
      const section = page.locator('[bf-s^="ToggleOutlineDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('outline toggles have border class', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleOutlineDemo_"]:not([data-slot])').first()
      const toggles = section.locator('[data-slot="toggle"]')
      await expect(toggles).toHaveCount(3)
    })
  })

  test.describe('Toolbar', () => {
    test('displays toolbar example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Toolbar")')).toBeVisible()
      const section = page.locator('[bf-s^="ToggleToolbarDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('shows active formatting summary', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleToolbarDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=Active formatting:')).toBeVisible()
      await expect(section.locator('text=None')).toBeVisible()
    })

    test('clicking toggle updates active formatting', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleToolbarDemo_"]:not([data-slot])').first()
      const toggles = section.locator('[data-slot="toggle"]')

      // Click Bold toggle
      await toggles.first().click()
      await expect(section.locator('text=Bold')).toBeVisible()
      await expect(section.locator('text=1 selected')).toBeVisible()
    })

    test('multiple toggles can be active', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleToolbarDemo_"]:not([data-slot])').first()
      const toggles = section.locator('[data-slot="toggle"]')

      await toggles.nth(0).click()
      await toggles.nth(1).click()
      await expect(section.locator('text=2 selected')).toBeVisible()
    })
  })

})
