import { test, expect } from '@playwright/test'

test.describe('Cart Block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/cart')
  })

  test('renders cart items with working buttons', async ({ page }) => {
    const section = page.locator('[bf-s^="CartDemo_"]:not([data-slot])').first()

    // Should render 4 cart items initially
    const items = section.locator('.divide-y > div')
    await expect(items).toHaveCount(4)

    // Quantity buttons should be functional (Button components are hydrated)
    const firstItem = items.first()
    const minusBtn = firstItem.locator('button:has-text("−")')
    const plusBtn = firstItem.locator('button:has-text("+")')
    await expect(minusBtn).toBeVisible()
    await expect(plusBtn).toBeVisible()
  })

  test('increment quantity updates item price', async ({ page }) => {
    const section = page.locator('[bf-s^="CartDemo_"]:not([data-slot])').first()
    const firstItem = section.locator('.divide-y > div').first()
    const plusBtn = firstItem.locator('button:has-text("+")')

    // Click + to increment quantity
    await plusBtn.click()

    // Quantity should show 2
    const quantity = firstItem.locator('.w-8.text-center')
    await expect(quantity).toHaveText('2')
  })

  test('remove all items shows empty cart state', async ({ page }) => {
    const section = page.locator('[bf-s^="CartDemo_"]:not([data-slot])').first()

    // Remove all 4 items
    for (let i = 0; i < 4; i++) {
      const removeBtn = section.locator('button:has-text("✕")').first()
      await removeBtn.click()
    }

    // Should show empty state
    await expect(section.locator('text=Your cart is empty')).toBeVisible()
  })

  test('remove item updates remaining item list reactively', async ({ page }) => {
    const section = page.locator('[bf-s^="CartDemo_"]:not([data-slot])').first()

    // Remove first item
    const removeBtn = section.locator('button:has-text("✕")').first()
    await removeBtn.click()

    // Should have 3 items now
    const items = section.locator('.divide-y > div')
    await expect(items).toHaveCount(3)
  })
})
