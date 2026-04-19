/**
 * Shared Counter Component E2E Tests
 *
 * Exports test functions that can be imported by adapter integrations.
 */

import { test, expect } from '@playwright/test'

/**
 * Run counter component E2E tests.
 *
 * @param baseUrl - The base URL of the server (e.g., 'http://localhost:3001')
 */
export function counterTests(baseUrl: string) {
  test.describe('Counter Component', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${baseUrl}/counter`)
    })

    test('displays initial count of 0', async ({ page }) => {
      await expect(page.locator('.counter-value')).toHaveText('0')
    })

    test('increments when +1 clicked', async ({ page }) => {
      await page.click('.btn-increment')
      await expect(page.locator('.counter-value')).toHaveText('1')
    })

    test('decrements when -1 clicked', async ({ page }) => {
      await page.click('.btn-decrement')
      await expect(page.locator('.counter-value')).toHaveText('-1')
    })

    test('shows doubled value', async ({ page }) => {
      await page.click('.btn-increment')
      await page.click('.btn-increment')
      await expect(page.locator('.counter-doubled')).toContainText('4')
    })

    test('resets to 0', async ({ page }) => {
      await page.click('.btn-increment')
      await page.click('.btn-increment')
      await page.click('.btn-reset')
      await expect(page.locator('.counter-value')).toHaveText('0')
    })

    test('handles multiple operations', async ({ page }) => {
      await page.click('.btn-increment')
      await expect(page.locator('.counter-value')).toHaveText('1')
      await page.click('.btn-increment')
      await expect(page.locator('.counter-value')).toHaveText('2')
      await page.click('.btn-increment')
      await expect(page.locator('.counter-value')).toHaveText('3')
      await expect(page.locator('.counter-doubled')).toContainText('6')
    })

    test('has valid ScopeID format', async ({ page }) => {
      // ScopeID should be in format: Counter_[6 random alphanumeric chars]
      const scopeId = await page.locator('[bf-s]').first().getAttribute('bf-s')
      expect(scopeId).toMatch(/^Counter_[a-z0-9]{6}$/)
    })
  })
}
