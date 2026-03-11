import { test, expect } from '@playwright/test'

test.describe('Separator Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/separator')
  })

  test.describe('Separator Rendering', () => {
    const separatorSelector = '[data-slot="separator"]'

    test('renders horizontal separators', async ({ page }) => {
      const horizontalSeparators = page.locator(`${separatorSelector}[data-orientation="horizontal"]`)
      await expect(horizontalSeparators.first()).toBeVisible()
    })

    test('renders vertical separators', async ({ page }) => {
      const verticalSeparators = page.locator(`${separatorSelector}[data-orientation="vertical"]`)
      await expect(verticalSeparators.first()).toBeVisible()
    })

    test('horizontal separator has correct styling', async ({ page }) => {
      const separator = page.locator(`${separatorSelector}[data-orientation="horizontal"]`).first()
      await expect(separator).toHaveClass(/bg-border/)
      await expect(separator).toHaveClass(/h-px/)
      await expect(separator).toHaveClass(/w-full/)
    })

    test('vertical separator has correct styling', async ({ page }) => {
      const separator = page.locator(`${separatorSelector}[data-orientation="vertical"]`).first()
      await expect(separator).toHaveClass(/bg-border/)
      await expect(separator).toHaveClass(/w-px/)
      await expect(separator).toHaveClass(/self-stretch/)
    })

    test('decorative separator has role="none"', async ({ page }) => {
      const separator = page.locator(`${separatorSelector}`).first()
      await expect(separator).toHaveAttribute('role', 'none')
    })
  })

})
