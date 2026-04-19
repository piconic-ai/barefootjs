/**
 * Shared Portal Component E2E Tests
 *
 * Tests Portal SSR rendering and client-side hydration.
 * Exports test functions that can be imported by adapter integrations.
 */

import { test, expect } from '@playwright/test'

/**
 * Run portal component E2E tests.
 *
 * @param baseUrl - The base URL of the server (e.g., 'http://localhost:8080')
 */
export function portalTests(baseUrl: string) {
  test.describe('Portal Component', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${baseUrl}/portal`)
    })

    test('portal content is not visible by default', async ({ page }) => {
      // Portal overlay and content should not be visible initially (hidden via CSS)
      await expect(page.locator('[data-testid="portal-overlay"]')).not.toBeVisible()
      await expect(page.locator('[data-testid="portal-content"]')).not.toBeVisible()
    })

    test('opens portal when button is clicked', async ({ page }) => {
      // Click the open button
      await page.click('[data-testid="open-portal"]')

      // Portal overlay and content should be visible
      await expect(page.locator('[data-testid="portal-overlay"]')).toBeVisible()
      await expect(page.locator('[data-testid="portal-content"]')).toBeVisible()
    })

    test('portal content renders at document.body', async ({ page }) => {
      await page.click('[data-testid="open-portal"]')

      // Portal content should be a direct child of body (or near body end)
      // Check that it's NOT inside the component scope
      const componentScope = page.locator('[bf-s^="PortalExample_"]')
      const portalInsideScope = componentScope.locator('[data-testid="portal-content"]')
      await expect(portalInsideScope).toHaveCount(0)

      // But portal content exists globally
      await expect(page.locator('[data-testid="portal-content"]')).toBeVisible()
    })

    test('closes portal when close button is clicked', async ({ page }) => {
      // Open the portal
      await page.click('[data-testid="open-portal"]')
      await expect(page.locator('[data-testid="portal-content"]')).toBeVisible()

      // Close the portal
      await page.click('[data-testid="close-portal"]')

      // Portal should be closed (hidden via CSS)
      await expect(page.locator('[data-testid="portal-overlay"]')).not.toBeVisible()
      await expect(page.locator('[data-testid="portal-content"]')).not.toBeVisible()
    })

    test('closes portal when overlay is clicked', async ({ page }) => {
      // Open the portal
      await page.click('[data-testid="open-portal"]')
      await expect(page.locator('[data-testid="portal-content"]')).toBeVisible()

      // Click the overlay (outside the content area)
      // The overlay is positioned with inset:0 covering the entire viewport
      // We click at the top-left corner which is outside the centered content
      await page.locator('[data-testid="portal-overlay"]').click({ position: { x: 10, y: 10 } })

      // Portal should be closed (hidden via CSS)
      await expect(page.locator('[data-testid="portal-overlay"]')).not.toBeVisible()
    })

    test('displays portal title and description', async ({ page }) => {
      await page.click('[data-testid="open-portal"]')

      // Check title and description are present
      await expect(page.locator('[data-testid="portal-content"] h2')).toHaveText('Portal Content')
      await expect(page.locator('[data-testid="portal-content"] p')).toContainText('rendered via Portal')
    })

    test('has valid ScopeID format', async ({ page }) => {
      // ScopeID should be in format: PortalExample_[6 random alphanumeric chars]
      const scopeId = await page.locator('[bf-s]').first().getAttribute('bf-s')
      expect(scopeId).toMatch(/^PortalExample_[a-z0-9]{6}$/)
    })
  })
}
