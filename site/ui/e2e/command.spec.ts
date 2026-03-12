import { test, expect } from '@playwright/test'

test.describe('Command Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/command')
  })

  test.describe('Preview Demo', () => {
    test('filtering hides non-matching items', async ({ page }) => {
      const section = page.locator('[bf-s^="CommandPreviewDemo_"]').first()
      const input = section.locator('input[data-slot="command-input"]')

      await input.fill('cal')
      // Wait for reactive effects + rAF
      await page.waitForTimeout(300)

      // "Calendar" and "Calculator" should be visible (contain "cal")
      const visibleItems = section.locator('[data-slot="command-item"]:visible')
      await expect(visibleItems).toHaveCount(2)
    })

    test('filtering shows empty state when no matches', async ({ page }) => {
      const section = page.locator('[bf-s^="CommandPreviewDemo_"]').first()
      const input = section.locator('input[data-slot="command-input"]')

      await input.fill('zzzzz')
      await page.waitForTimeout(300)

      await expect(section.locator('[data-slot="command-empty"]')).toBeVisible()
    })

    test('arrow key navigation changes selected item', async ({ page }) => {
      const section = page.locator('[bf-s^="CommandPreviewDemo_"]').first()
      const input = section.locator('input[data-slot="command-input"]')

      // Type something to trigger auto-selection, then clear
      await input.click()
      await input.fill('a')
      await page.waitForTimeout(200)
      await input.fill('')
      await page.waitForTimeout(200)

      // Press ArrowDown and verify selection changes
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(100)

      // Second item should now be selected
      const items = section.locator('[data-slot="command-item"]')
      await expect(items.nth(1)).toHaveAttribute('data-selected', 'true')
    })
  })

  test.describe('Dialog Demo', () => {
    test('opens dialog on button click', async ({ page }) => {
      await page.locator('[data-command-dialog-trigger]').click()
      await page.waitForTimeout(200)

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      const input = dialog.locator('input[data-slot="command-input"]')
      await expect(input).toBeVisible()
    })

    test('closes dialog on ESC', async ({ page }) => {
      await page.locator('[data-command-dialog-trigger]').click()
      await page.waitForTimeout(200)

      await expect(page.locator('[role="dialog"]')).toBeVisible()

      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)

      const dialog = page.locator('[data-slot="dialog-content"]')
      await expect(dialog).toHaveAttribute('data-state', 'closed')
    })
  })

})
