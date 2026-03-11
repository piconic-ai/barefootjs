import { test, expect } from '@playwright/test'

test.describe('Button Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/button')
  })

  test.describe('Props Playground', () => {
    test('changing children text updates preview button', async ({ page }) => {
      const preview = page.locator('[data-button-preview]')
      const section = page.locator('#preview')
      const input = section.locator('input[type="text"]')

      await input.fill('Click me')
      await expect(preview.locator('button')).toContainText('Click me')
    })

    test('changing variant updates preview button class', async ({ page }) => {
      const preview = page.locator('[data-button-preview]')
      const section = page.locator('#preview')

      // Open variant select and pick "outline"
      await section.locator('button[role="combobox"]').first().click()
      await page.locator('[role="option"]:has-text("outline")').click()

      // Preview button should have outline variant class
      const btn = preview.locator('button')
      await expect(btn).toHaveClass(/border/)
    })

    test('changing size updates preview button class', async ({ page }) => {
      const preview = page.locator('[data-button-preview]')
      const section = page.locator('#preview')

      // Open size select (second combobox) and pick "sm"
      await section.locator('button[role="combobox"]').nth(1).click()
      await page.locator('[role="option"]:has-text("sm")').first().click()

      // Preview button should have sm size class
      const btn = preview.locator('button')
      await expect(btn).toHaveClass(/h-8/)
    })
  })
})
