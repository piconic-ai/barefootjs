import { test, expect } from '@playwright/test'

test.describe('Input Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/input')
  })

  test.describe('Input Rendering', () => {
    test('displays input elements', async ({ page }) => {
      const inputs = page.locator('input[data-slot="input"]')
      await expect(inputs.first()).toBeVisible()
    })

    test('has multiple input examples', async ({ page }) => {
      const inputs = page.locator('input[data-slot="input"]')
      // Should have at least 5 inputs on the page (preview + types + disabled examples)
      expect(await inputs.count()).toBeGreaterThan(4)
    })
  })

  test.describe('Input Types', () => {
    test('displays input types example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Input Types")')).toBeVisible()
    })

    test('has text, email, password, and number inputs', async ({ page }) => {
      await expect(page.locator('input[type="text"][placeholder="Text input"]').first()).toBeVisible()
      await expect(page.locator('input[type="email"][placeholder="Email address"]').first()).toBeVisible()
      await expect(page.locator('input[type="password"][placeholder="Password"]').first()).toBeVisible()
      await expect(page.locator('input[type="number"][placeholder="Number"]').first()).toBeVisible()
    })
  })

  test.describe('Disabled', () => {
    test('displays disabled example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Disabled")')).toBeVisible()
    })

    test('has disabled inputs', async ({ page }) => {
      const disabledInputs = page.locator('input[data-slot="input"][disabled]')
      expect(await disabledInputs.count()).toBeGreaterThanOrEqual(2)
    })
  })

  test.describe('Value Binding', () => {
    test('displays value binding section', async ({ page }) => {
      await expect(page.locator('h3:has-text("Value Binding")')).toBeVisible()
      const section = page.locator('[bf-s^="InputBindingDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('updates output when typing', async ({ page }) => {
      const section = page.locator('[bf-s^="InputBindingDemo_"]:not([data-slot])').first()
      const input = section.locator('input[data-slot="input"]')
      const output = section.locator('.typed-value')

      await input.pressSequentially('hello')
      await expect(output).toContainText('hello')
    })
  })

  test.describe('Focus State', () => {
    test('displays focus state example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Focus State")')).toBeVisible()
      const section = page.locator('[bf-s^="InputFocusDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
      await expect(section.locator('.focus-status')).toBeVisible()
    })

    test('shows focused state on focus', async ({ page }) => {
      const section = page.locator('[bf-s^="InputFocusDemo_"]:not([data-slot])').first()
      const input = section.locator('input[data-slot="input"]')
      const status = section.locator('.focus-status')

      await expect(status).toContainText('Not focused')
      await input.click()
      await expect(status).toContainText('Focused')
    })

    test('shows not focused state on blur', async ({ page }) => {
      const section = page.locator('[bf-s^="InputFocusDemo_"]:not([data-slot])').first()
      const input = section.locator('input[data-slot="input"]')
      const status = section.locator('.focus-status')

      await input.click()
      await expect(status).toContainText('Focused')
      await input.blur()
      await expect(status).toContainText('Not focused')
    })
  })
})
