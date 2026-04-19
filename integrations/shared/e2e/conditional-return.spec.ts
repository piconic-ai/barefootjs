/**
 * Shared ConditionalReturn Component E2E Tests
 *
 * Tests if/else conditional JSX returns with reactive state.
 * Verifies:
 * - Correct element rendered per branch (button vs link)
 * - Initial text content
 * - Click increments count
 * - data-active attribute updates reactively (note: data-active is app-level, not bf attribute)
 * - ScopeID format
 */

import { test, expect } from '@playwright/test'

/**
 * Run conditional return component E2E tests.
 *
 * @param baseUrl - The base URL of the server (e.g., 'http://localhost:3001')
 */
export function conditionalReturnTests(baseUrl: string) {
  test.describe('ConditionalReturn - button variant (default)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${baseUrl}/conditional-return`)
    })

    test('renders a button element', async ({ page }) => {
      const button = page.locator('button.conditional-button')
      await expect(button).toBeVisible()
    })

    test('does not render a link element', async ({ page }) => {
      await expect(page.locator('a.conditional-link')).toHaveCount(0)
    })

    test('initial text contains "button variant: 0"', async ({ page }) => {
      const button = page.locator('button.conditional-button')
      await expect(button).toContainText('button variant: 0')
    })

    test('click increments count', async ({ page }) => {
      const button = page.locator('button.conditional-button')
      await button.click()
      await expect(button).toContainText('button variant: 1')
    })

    test('data-active updates reactively', async ({ page }) => {
      const button = page.locator('button.conditional-button')
      await expect(button).toHaveAttribute('data-active', 'false')
      await button.click()
      await expect(button).toHaveAttribute('data-active', 'true')
    })

    test('has valid ScopeID format', async ({ page }) => {
      const scopeId = await page.locator('[bf-s]').first().getAttribute('bf-s')
      expect(scopeId).toMatch(/^ConditionalReturn_[a-z0-9]{6}$/)
    })
  })

  test.describe('ConditionalReturn - link variant', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${baseUrl}/conditional-return-link`)
    })

    test('renders a link element', async ({ page }) => {
      const link = page.locator('a.conditional-link')
      await expect(link).toBeVisible()
    })

    test('does not render a button element', async ({ page }) => {
      await expect(page.locator('button.conditional-button')).toHaveCount(0)
    })

    test('initial text contains "link variant: 0"', async ({ page }) => {
      const link = page.locator('a.conditional-link')
      await expect(link).toContainText('link variant: 0')
    })

    test('click increments count', async ({ page }) => {
      const link = page.locator('a.conditional-link')
      await link.click()
      await expect(link).toContainText('link variant: 1')
    })

    test('data-active updates reactively', async ({ page }) => {
      const link = page.locator('a.conditional-link')
      await expect(link).toHaveAttribute('data-active', 'false')
      await link.click()
      await expect(link).toHaveAttribute('data-active', 'true')
    })

    test('has valid ScopeID format', async ({ page }) => {
      const scopeId = await page.locator('[bf-s]').first().getAttribute('bf-s')
      expect(scopeId).toMatch(/^ConditionalReturn_[a-z0-9]{6}$/)
    })
  })
}
