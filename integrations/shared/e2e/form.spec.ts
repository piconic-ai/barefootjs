/**
 * Shared Form Component E2E Tests
 *
 * Tests checkbox + button interaction pattern.
 * Verifies:
 * - Initial state (unchecked checkbox, disabled button)
 * - Checkbox toggle behavior
 * - Button enabled/disabled state
 * - SVG checkmark rendering (null branch fix)
 * - ScopeID format
 */

import { test, expect } from '@playwright/test'

/**
 * Run form component E2E tests.
 *
 * @param baseUrl - The base URL of the server (e.g., 'http://localhost:3001')
 */
export function formTests(baseUrl: string) {
  test.describe('Form Component', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${baseUrl}/form`)
      // Wait for Form component to be fully hydrated
      await page.waitForSelector('.form-container[bf-s]', { timeout: 10000 })
    })

    test('displays form container with title', async ({ page }) => {
      await expect(page.locator('h2:has-text("Terms and Conditions")')).toBeVisible()
    })

    test('checkbox starts unchecked', async ({ page }) => {
      const checkbox = page.locator('.checkbox')
      await expect(checkbox).toHaveAttribute('data-state', 'unchecked')
      await expect(checkbox).toHaveAttribute('aria-checked', 'false')
    })

    test('submit button starts disabled', async ({ page }) => {
      const submitBtn = page.locator('.submit-btn')
      await expect(submitBtn).toBeDisabled()
    })

    test('checkmark SVG is not visible when unchecked', async ({ page }) => {
      const checkmark = page.locator('.checkbox .checkmark')
      await expect(checkmark).toHaveCount(0)
    })

    test('checkbox toggles to checked on click', async ({ page }) => {
      const checkbox = page.locator('.checkbox')

      await checkbox.click()

      await expect(checkbox).toHaveAttribute('data-state', 'checked')
      await expect(checkbox).toHaveAttribute('aria-checked', 'true')
    })

    test('checkmark SVG appears when checked', async ({ page }) => {
      const checkbox = page.locator('.checkbox')

      await checkbox.click()

      const checkmark = page.locator('.checkbox .checkmark')
      await expect(checkmark).toBeVisible()
    })

    test('submit button becomes enabled when checkbox is checked', async ({ page }) => {
      const checkbox = page.locator('.checkbox')
      const submitBtn = page.locator('.submit-btn')

      await expect(submitBtn).toBeDisabled()

      await checkbox.click()

      await expect(submitBtn).toBeEnabled()
    })

    test('checkbox toggles back to unchecked on second click', async ({ page }) => {
      const checkbox = page.locator('.checkbox')

      await checkbox.click()
      await expect(checkbox).toHaveAttribute('data-state', 'checked')

      await checkbox.click()
      await expect(checkbox).toHaveAttribute('data-state', 'unchecked')
    })

    test('checkmark SVG disappears when unchecked again', async ({ page }) => {
      const checkbox = page.locator('.checkbox')

      await checkbox.click()
      await expect(page.locator('.checkbox .checkmark')).toBeVisible()

      await checkbox.click()
      await expect(page.locator('.checkbox .checkmark')).toHaveCount(0)
    })

    test('submit button becomes disabled when checkbox is unchecked again', async ({ page }) => {
      const checkbox = page.locator('.checkbox')
      const submitBtn = page.locator('.submit-btn')

      await checkbox.click()
      await expect(submitBtn).toBeEnabled()

      await checkbox.click()
      await expect(submitBtn).toBeDisabled()
    })

    test('checkbox style changes with state', async ({ page }) => {
      const checkbox = page.locator('.checkbox')

      // Unchecked state - white/gray
      await expect(checkbox).toHaveCSS('background-color', 'rgb(255, 255, 255)')

      await checkbox.click()

      // Checked state - green
      await expect(checkbox).toHaveCSS('background-color', 'rgb(76, 175, 80)')
    })

    test('Form has valid ScopeID format', async ({ page }) => {
      // Form component should have ScopeID in format: Form_[6 random chars]
      const scopeId = await page.locator('.form-container[bf-s]').getAttribute('bf-s')
      expect(scopeId).toMatch(/^Form_[a-z0-9]{6}$/)
    })
  })
}
