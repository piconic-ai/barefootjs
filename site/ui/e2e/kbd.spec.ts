import { test, expect } from '@playwright/test'

test.describe('Kbd Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/kbd')
  })

  test.describe('Props Playground', () => {
    test('changing children text updates preview kbd', async ({ page }) => {
      const preview = page.locator('[data-kbd-preview]')
      const section = page.locator('#preview')
      const input = section.locator('input[type="text"]')

      await input.fill('K')
      await expect(preview.locator('[data-slot="kbd"]')).toContainText('K')
    })
  })

  test.describe('Kbd Demo', () => {
    test('displays keyboard keys', async ({ page }) => {
      const demo = page.locator('[data-testid="kbd-demo"]')

      await expect(demo).toBeVisible()
      // Should contain multiple kbd elements
      const kbds = demo.locator('[data-slot="kbd"]')
      await expect(kbds).toHaveCount(7) // ⌘, K, Ctrl, C, Enter, Shift, Esc
    })

    test('displays kbd-group elements', async ({ page }) => {
      const demo = page.locator('[data-testid="kbd-demo"]')

      const groups = demo.locator('[data-slot="kbd-group"]')
      await expect(groups).toHaveCount(2) // ⌘+K, Ctrl+C
    })
  })

  test.describe('Shortcuts Demo', () => {
    test('displays shortcut list', async ({ page }) => {
      const demo = page.locator('[data-testid="kbd-shortcuts-demo"]')

      await expect(demo).toBeVisible()
      // Should contain shortcut labels
      await expect(demo).toContainText('Search')
      await expect(demo).toContainText('Copy')
      await expect(demo).toContainText('Paste')
      await expect(demo).toContainText('Undo')
    })
  })
})
