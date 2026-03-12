import { test, expect } from '@playwright/test'

test.describe('Textarea Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/textarea')
  })

  test.describe('Textarea Rendering', () => {
    test('displays textarea elements', async ({ page }) => {
      const textareas = page.locator('textarea[data-slot="textarea"]')
      await expect(textareas.first()).toBeVisible()
    })

    test('has multiple textarea examples', async ({ page }) => {
      const textareas = page.locator('textarea[data-slot="textarea"]')
      // Should have textareas on the page (playground + usage + examples)
      expect(await textareas.count()).toBeGreaterThanOrEqual(4)
    })
  })

  test.describe('Disabled', () => {
    test('has disabled textarea', async ({ page }) => {
      const disabledTextarea = page.locator('textarea[data-slot="textarea"][disabled]')
      await expect(disabledTextarea.first()).toBeVisible()
    })
  })

  test.describe('Value Binding', () => {
    test('updates character count on input', async ({ page }) => {
      const section = page.locator('[bf-s^="TextareaBindingDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()

      const textarea = section.locator('textarea[data-slot="textarea"]')
      const charCount = section.locator('.char-count')

      // Initially 0 characters
      await expect(charCount).toContainText('0')

      // Click to focus and type using keyboard
      await textarea.click()
      await page.keyboard.type('Hello')
      await expect(charCount).toContainText('5')
    })
  })
})
