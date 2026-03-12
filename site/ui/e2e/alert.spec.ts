import { test, expect } from '@playwright/test'

test.describe('Alert Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/alert')
  })

  test.describe('Props Playground', () => {
    test('default variant renders alert with default styling', async ({ page }) => {
      const preview = page.locator('[data-alert-preview]')
      const alert = preview.locator('[role="alert"]')
      await expect(alert).toBeVisible()
      await expect(alert).toHaveClass(/bg-card/)
    })

    test('changing variant to destructive updates preview', async ({ page }) => {
      const preview = page.locator('[data-alert-preview]')
      const section = page.locator('#preview')

      // Open variant select and pick "destructive"
      await section.locator('button[role="combobox"]').first().click()
      await page.locator('[role="option"]:has-text("destructive")').click()

      // Preview alert should have destructive variant class
      const alert = preview.locator('[role="alert"]')
      await expect(alert).toHaveClass(/text-destructive/)
    })
  })
})
