import { test, expect } from '@playwright/test'

test.describe('Toggle Group Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/toggle-group')
  })

  test.describe('Toggle Group Rendering', () => {
    test('displays toggle-group elements with data-slot', async ({ page }) => {
      const groups = page.locator('[data-slot="toggle-group"]')
      await expect(groups.first()).toBeVisible()
    })

    test('has toggle-group-item elements', async ({ page }) => {
      const items = page.locator('[data-slot="toggle-group-item"]')
      expect(await items.count()).toBeGreaterThan(3)
    })
  })

  test.describe('Basic', () => {
    test('displays basic example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Basic")')).toBeVisible()
      const section = page.locator('[bf-s^="ToggleGroupBasicDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('has three toggle items', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupBasicDemo_"]:not([data-slot])').first()
      const items = section.locator('[data-slot="toggle-group-item"]')
      await expect(items).toHaveCount(3)
    })

    test('center item starts selected (defaultValue)', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupBasicDemo_"]:not([data-slot])').first()
      const items = section.locator('[data-slot="toggle-group-item"]')
      // center is the second item (index 1)
      await expect(items.nth(1)).toHaveAttribute('aria-pressed', 'true')
      await expect(items.nth(1)).toHaveAttribute('data-state', 'on')
    })

    test('other items start unselected', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupBasicDemo_"]:not([data-slot])').first()
      const items = section.locator('[data-slot="toggle-group-item"]')
      await expect(items.nth(0)).toHaveAttribute('aria-pressed', 'false')
      await expect(items.nth(0)).toHaveAttribute('data-state', 'off')
      await expect(items.nth(2)).toHaveAttribute('aria-pressed', 'false')
      await expect(items.nth(2)).toHaveAttribute('data-state', 'off')
    })

    test('single select: clicking one deselects others', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupBasicDemo_"]:not([data-slot])').first()
      const items = section.locator('[data-slot="toggle-group-item"]')

      // Center (index 1) is initially selected
      await expect(items.nth(1)).toHaveAttribute('aria-pressed', 'true')

      // Click left (index 0)
      await items.nth(0).click()

      // Left should be selected, center should be deselected
      await expect(items.nth(0)).toHaveAttribute('aria-pressed', 'true')
      await expect(items.nth(0)).toHaveAttribute('data-state', 'on')
      await expect(items.nth(1)).toHaveAttribute('aria-pressed', 'false')
      await expect(items.nth(1)).toHaveAttribute('data-state', 'off')
    })

    test('preview text alignment changes with selection', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupBasicDemo_"]:not([data-slot])').first()
      const preview = section.locator('[data-testid="alignment-preview"]')
      const items = section.locator('[data-slot="toggle-group-item"]')

      // Default: center alignment
      await expect(preview).toHaveClass(/text-center/)

      // Click left
      await items.nth(0).click()
      await expect(preview).toHaveClass(/text-left/)

      // Click right
      await items.nth(2).click()
      await expect(preview).toHaveClass(/text-right/)
    })
  })

  test.describe('Outline', () => {
    test('displays outline example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Outline")')).toBeVisible()
      const section = page.locator('[bf-s^="ToggleGroupOutlineDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('has three toggle items', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupOutlineDemo_"]:not([data-slot])').first()
      const items = section.locator('[data-slot="toggle-group-item"]')
      await expect(items).toHaveCount(3)
    })

    test('group has outline variant attribute', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupOutlineDemo_"]:not([data-slot])').first()
      const group = section.locator('[data-slot="toggle-group"]')
      await expect(group).toHaveAttribute('data-variant', 'outline')
    })

    test('preview font size changes with selection', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupOutlineDemo_"]:not([data-slot])').first()
      const preview = section.locator('[data-testid="fontsize-preview"]')
      const items = section.locator('[data-slot="toggle-group-item"]')

      // Default: M (text-base)
      await expect(preview).toHaveClass(/text-base/)

      // Click S
      await items.nth(0).click()
      await expect(preview).toHaveClass(/text-sm/)

      // Click L
      await items.nth(2).click()
      await expect(preview).toHaveClass(/text-lg/)
    })
  })

  test.describe('Multiple', () => {
    test('displays multiple example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Multiple")')).toBeVisible()
      const section = page.locator('[bf-s^="ToggleGroupMultipleDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('has three toggle items', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupMultipleDemo_"]:not([data-slot])').first()
      const items = section.locator('[data-slot="toggle-group-item"]')
      await expect(items).toHaveCount(3)
    })

    test('all items start unselected', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupMultipleDemo_"]:not([data-slot])').first()
      const items = section.locator('[data-slot="toggle-group-item"]')
      for (let i = 0; i < 3; i++) {
        await expect(items.nth(i)).toHaveAttribute('aria-pressed', 'false')
      }
    })

    test('multiple items can be active simultaneously', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupMultipleDemo_"]:not([data-slot])').first()
      const items = section.locator('[data-slot="toggle-group-item"]')

      // Click Bold and Italic
      await items.nth(0).click()
      await items.nth(1).click()

      // Both should be selected
      await expect(items.nth(0)).toHaveAttribute('aria-pressed', 'true')
      await expect(items.nth(0)).toHaveAttribute('data-state', 'on')
      await expect(items.nth(1)).toHaveAttribute('aria-pressed', 'true')
      await expect(items.nth(1)).toHaveAttribute('data-state', 'on')
      // Third should still be unselected
      await expect(items.nth(2)).toHaveAttribute('aria-pressed', 'false')
    })

    test('clicking active item deselects it', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupMultipleDemo_"]:not([data-slot])').first()
      const items = section.locator('[data-slot="toggle-group-item"]')

      // Select Bold
      await items.nth(0).click()
      await expect(items.nth(0)).toHaveAttribute('aria-pressed', 'true')

      // Deselect Bold
      await items.nth(0).click()
      await expect(items.nth(0)).toHaveAttribute('aria-pressed', 'false')
    })

    test('preview text formatting changes with selection', async ({ page }) => {
      const section = page.locator('[bf-s^="ToggleGroupMultipleDemo_"]:not([data-slot])').first()
      const preview = section.locator('[data-testid="format-preview"]')
      const items = section.locator('[data-slot="toggle-group-item"]')

      // Initially no formatting
      await expect(preview).not.toHaveClass(/font-bold/)
      await expect(preview).not.toHaveClass(/italic/)
      await expect(preview).not.toHaveClass(/underline/)

      // Click Bold
      await items.nth(0).click()
      await expect(preview).toHaveClass(/font-bold/)

      // Click Italic
      await items.nth(1).click()
      await expect(preview).toHaveClass(/font-bold/)
      await expect(preview).toHaveClass(/italic/)

      // Click Underline
      await items.nth(2).click()
      await expect(preview).toHaveClass(/font-bold/)
      await expect(preview).toHaveClass(/italic/)
      await expect(preview).toHaveClass(/underline/)

      // Deselect Bold
      await items.nth(0).click()
      await expect(preview).not.toHaveClass(/font-bold/)
      await expect(preview).toHaveClass(/italic/)
      await expect(preview).toHaveClass(/underline/)
    })
  })

})
