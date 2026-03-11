import { test, expect } from '@playwright/test'

test.describe('Skeleton Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/skeleton')
  })

  test('renders page header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Skeleton')
  })

  test('renders skeleton in playground', async ({ page }) => {
    await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible()
  })

  test('renders API reference section', async ({ page }) => {
    await expect(page.locator('#api-reference')).toBeVisible()
  })
})
