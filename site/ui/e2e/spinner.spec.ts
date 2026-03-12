import { test, expect } from '@playwright/test'

test.describe('Spinner Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/spinner')
  })

  test.describe('Spinner Display', () => {
    const spinnerSelector = '[data-slot="spinner"]'

    test('displays spinner with correct SVG element', async ({ page }) => {
      const spinner = page.locator(spinnerSelector).first()
      await expect(spinner).toBeVisible()

      const tagName = await spinner.evaluate((el) => el.tagName.toLowerCase())
      expect(tagName).toBe('svg')
    })

    test('has animate-spin class', async ({ page }) => {
      const spinner = page.locator(spinnerSelector).first()
      await expect(spinner).toHaveClass(/animate-spin/)
    })

    test('has role=status for accessibility', async ({ page }) => {
      const spinner = page.locator(spinnerSelector).first()
      await expect(spinner).toHaveAttribute('role', 'status')
    })

    test('has aria-label for accessibility', async ({ page }) => {
      const spinner = page.locator(spinnerSelector).first()
      await expect(spinner).toHaveAttribute('aria-label', 'Loading')
    })
  })

  test.describe('Sizes Demo', () => {
    test('displays multiple spinners with different sizes', async ({ page }) => {
      const spinners = page.locator('[data-slot="spinner"]')
      const count = await spinners.count()
      expect(count).toBeGreaterThanOrEqual(4)
    })
  })

  test.describe('Button Loading Demo', () => {
    test('shows spinner on button click', async ({ page }) => {
      const button = page.locator('[data-testid="spinner-button"]')
      await expect(button).toBeVisible()

      // Initially shows "Submit" and no spinner
      const label = page.locator('[data-testid="spinner-button-label"]')
      await expect(label).toContainText('Submit')
      const spinnerInButton = button.locator('[data-slot="spinner"]')
      await expect(spinnerInButton).toHaveCount(0)

      // Click the button to trigger loading state
      await button.click()

      // Spinner appears and text changes
      await expect(spinnerInButton).toHaveCount(1)
      await expect(spinnerInButton).toBeVisible()
      await expect(label).toContainText('Processing...')
    })
  })
})
