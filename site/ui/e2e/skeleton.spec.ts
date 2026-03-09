import { test, expect } from '@playwright/test'

test.describe('Skeleton Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/components/skeleton')
  })

  test.describe('Skeleton Rendering', () => {
    const skeletonSelector = '[data-slot="skeleton"]'

    test('renders skeleton elements', async ({ page }) => {
      const skeletons = page.locator(skeletonSelector)
      await expect(skeletons.first()).toBeVisible()
    })

    test('skeleton has correct styling', async ({ page }) => {
      const skeleton = page.locator(skeletonSelector).first()
      await expect(skeleton).toHaveClass(/bg-muted/)
      await expect(skeleton).toHaveClass(/animate-pulse/)
      await expect(skeleton).toHaveClass(/rounded-md/)
    })
  })
})

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
