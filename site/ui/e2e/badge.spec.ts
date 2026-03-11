import { test, expect } from '@playwright/test'

test.describe('Badge Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/badge')
  })

  test.describe('Props Playground', () => {
    test('changing children text updates preview badge', async ({ page }) => {
      const preview = page.locator('[data-badge-preview]')
      const section = page.locator('#preview')
      const input = section.locator('input[type="text"]')

      await input.fill('Status')
      await expect(preview.locator('[data-slot="badge"]')).toContainText('Status')
    })

    test('changing variant updates preview badge class', async ({ page }) => {
      const preview = page.locator('[data-badge-preview]')
      const section = page.locator('#preview')

      // Open variant select and pick "destructive"
      await section.locator('button[role="combobox"]').first().click()
      await page.locator('[role="option"]:has-text("destructive")').click()

      // Preview badge should have destructive variant class
      await expect(preview.locator('[data-slot="badge"]')).toHaveClass(/bg-destructive/)
    })
  })

  test.describe('Badge asChild', () => {
    test('reactive count updates on click', async ({ page }) => {
      const link = page.locator('[data-testid="badge-aschild-link"]')

      // Initially 0 clicks
      await expect(link).toContainText('Clicked 0 times')

      // Click to increment
      await link.click()
      await expect(link).toContainText('Clicked 1 times')

      // Click again
      await link.click()
      await expect(link).toContainText('Clicked 2 times')
    })
  })
})
