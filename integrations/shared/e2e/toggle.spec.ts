/**
 * Shared Toggle Component E2E Tests
 *
 * Exports test functions that can be imported by adapter integrations.
 */

import { test, expect } from '@playwright/test'

/**
 * Run toggle component E2E tests.
 *
 * @param baseUrl - The base URL of the server (e.g., 'http://localhost:3001')
 */
export function toggleTests(baseUrl: string) {
  test.describe('Toggle Component', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${baseUrl}/toggle`)
      // Wait for ToggleItem components to be fully hydrated
      await page.waitForSelector('.toggle-item[bf-s]', { timeout: 10000 })
    })

    test('displays settings panel', async ({ page }) => {
      await expect(page.locator('h3:has-text("Settings")')).toBeVisible()
    })

    test('displays three toggle items', async ({ page }) => {
      await expect(page.locator('.toggle-item')).toHaveCount(3)
    })

    test('Setting 1 starts as ON', async ({ page }) => {
      const setting1 = page.locator('.toggle-item').nth(0)
      await expect(setting1.locator('button')).toHaveText('ON')
    })

    test('Setting 2 starts as OFF', async ({ page }) => {
      const setting2 = page.locator('.toggle-item').nth(1)
      await expect(setting2.locator('button')).toHaveText('OFF')
    })

    test('Setting 3 starts as OFF', async ({ page }) => {
      const setting3 = page.locator('.toggle-item').nth(2)
      await expect(setting3.locator('button')).toHaveText('OFF')
    })

    test('toggles Setting 1 from ON to OFF', async ({ page }) => {
      const setting1Button = page.locator('.toggle-item').nth(0).locator('button')

      await expect(setting1Button).toHaveText('ON')
      await setting1Button.click()
      await expect(setting1Button).toHaveText('OFF')
    })

    test('toggles Setting 2 from OFF to ON', async ({ page }) => {
      const setting2Button = page.locator('.toggle-item').nth(1).locator('button')

      await expect(setting2Button).toHaveText('OFF')
      await setting2Button.click()
      await expect(setting2Button).toHaveText('ON')
    })

    test('toggle button style changes with state', async ({ page }) => {
      const setting2Button = page.locator('.toggle-item').nth(1).locator('button')

      // OFF state - gray background
      await expect(setting2Button).toHaveCSS('background-color', 'rgb(204, 204, 204)')

      await setting2Button.click()

      // ON state - green background
      await expect(setting2Button).toHaveCSS('background-color', 'rgb(76, 175, 80)')
    })

    test('multiple toggles work independently', async ({ page }) => {
      const setting1Button = page.locator('.toggle-item').nth(0).locator('button')
      const setting2Button = page.locator('.toggle-item').nth(1).locator('button')
      const setting3Button = page.locator('.toggle-item').nth(2).locator('button')

      // Initial state
      await expect(setting1Button).toHaveText('ON')
      await expect(setting2Button).toHaveText('OFF')
      await expect(setting3Button).toHaveText('OFF')

      // Toggle all
      await setting1Button.click()
      await setting2Button.click()
      await setting3Button.click()

      // All should be flipped
      await expect(setting1Button).toHaveText('OFF')
      await expect(setting2Button).toHaveText('ON')
      await expect(setting3Button).toHaveText('ON')
    })

    test('parent Toggle has valid ScopeID format', async ({ page }) => {
      // Parent Toggle component should have ScopeID in format: Toggle_[6 random chars]
      const scopeId = await page.locator('.settings-panel[bf-s]').getAttribute('bf-s')
      expect(scopeId).toMatch(/^Toggle_[a-z0-9]{6}$/)
    })

    test('each ToggleItem has valid ScopeID format', async ({ page }) => {
      // Each ToggleItem should have ScopeID in format: ToggleItem_[6 random chars]
      const toggleItems = page.locator('.toggle-item[bf-s]')
      await expect(toggleItems).toHaveCount(3)

      for (let i = 0; i < 3; i++) {
        const scopeId = await toggleItems.nth(i).getAttribute('bf-s')
        expect(scopeId).toMatch(/^~?ToggleItem_[a-z0-9]{6}$/)
      }
    })

    test('all ScopeIDs are unique', async ({ page }) => {
      // Collect all ScopeIDs on the page
      const allScopeIds = await page.locator('[bf-s]').evaluateAll(
        elements => elements.map(el => el.getAttribute('bf-s'))
      )

      // Should have 4 ScopeIDs: 1 Toggle + 3 ToggleItems
      expect(allScopeIds.length).toBe(4)

      // All should be unique
      const uniqueScopeIds = new Set(allScopeIds)
      expect(uniqueScopeIds.size).toBe(4)
    })
  })
}
