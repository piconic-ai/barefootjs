import { test, expect } from '@playwright/test'

test.describe('Item Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/item')
  })

  test.describe('Settings List Demo', () => {
    // Scope to the ItemGroup inside the settings-list example
    const settingsSelector = ':below(#settings-list) [data-slot="item-group"]'

    test('renders notification toggle button', async ({ page }) => {
      const group = page.locator(settingsSelector).first()
      const button = group.locator('button:has-text("On")').first()
      await expect(button).toBeVisible()
    })

    test('clicking toggle switches notification state', async ({ page }) => {
      const group = page.locator(settingsSelector).first()
      const notifItem = group.locator('[data-slot="item"]').first()
      const button = notifItem.locator('button')

      // Initially "On"
      await expect(button).toHaveText('On')

      // Click to turn off
      await button.click()
      await expect(button).toHaveText('Off')

      // Click to turn back on
      await button.click()
      await expect(button).toHaveText('On')
    })

    test('dark mode toggle works independently', async ({ page }) => {
      const group = page.locator(settingsSelector).first()
      const darkModeItem = group.locator('[data-slot="item"]').nth(1)
      const darkModeButton = darkModeItem.locator('button')

      // Dark Mode button starts as "Off"
      await expect(darkModeButton).toHaveText('Off')

      // Click to turn on
      await darkModeButton.click()
      await expect(darkModeButton).toHaveText('On')
    })
  })

  test.describe('Item Structure', () => {
    test('item group has data-slot attribute', async ({ page }) => {
      const itemGroup = page.locator('[data-slot="item-group"]').first()
      await expect(itemGroup).toBeVisible()
    })

    test('items have data-slot and data-variant attributes', async ({ page }) => {
      const item = page.locator('[data-slot="item"]').first()
      await expect(item).toBeVisible()
      await expect(item).toHaveAttribute('data-variant')
    })

    test('item title renders correctly', async ({ page }) => {
      const title = page.locator('[data-slot="item-title"]').first()
      await expect(title).toBeVisible()
    })

    test('item description renders correctly', async ({ page }) => {
      const description = page.locator('[data-slot="item-description"]').first()
      await expect(description).toBeVisible()
    })
  })

  test.describe('Playground', () => {
    test('variant selector changes item style', async ({ page }) => {
      const playground = page.locator('[data-item-preview]')
      const previewItem = playground.locator('[data-slot="item"]')

      // Default variant
      await expect(previewItem).toHaveAttribute('data-variant', 'default')

      // Open variant selector (first select trigger in the playground panel)
      const controls = playground.locator('..').locator('..').locator('[data-slot="select-trigger"]').first()
      await controls.click()

      // Select outline variant
      await page.locator('[data-slot="select-item"]:has-text("outline")').click()

      // Verify item has outline variant
      await expect(previewItem).toHaveAttribute('data-variant', 'outline')
    })
  })
})
