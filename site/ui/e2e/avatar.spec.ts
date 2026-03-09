import { test, expect } from '@playwright/test'

test.describe('Avatar Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/components/avatar')
  })

  test.describe('Avatar Structure', () => {
    const avatarSelector = '[data-slot="avatar"]'

    test('displays avatar with correct data-slot', async ({ page }) => {
      await expect(page.locator(avatarSelector).first()).toBeVisible()
    })

    test('avatar has correct base styling', async ({ page }) => {
      const avatar = page.locator(avatarSelector).first()
      await expect(avatar).toHaveClass(/relative/)
      await expect(avatar).toHaveClass(/rounded-full/)
      await expect(avatar).toHaveClass(/overflow-hidden/)
    })

    test('avatar image has correct data-slot', async ({ page }) => {
      const img = page.locator('[data-slot="avatar-image"]').first()
      await expect(img).toBeVisible()
    })

    test('avatar image has src attribute', async ({ page }) => {
      const img = page.locator('[data-slot="avatar-image"]').first()
      await expect(img).toHaveAttribute('src', /github/)
    })

    test('avatar fallback has correct data-slot', async ({ page }) => {
      const fallback = page.locator('[data-slot="avatar-fallback"]').first()
      await expect(fallback).toBeVisible()
    })

    test('fallback displays initials text', async ({ page }) => {
      const fallback = page.locator('[data-slot="avatar-fallback"]:has-text("BF")')
      await expect(fallback).toBeVisible()
    })

    test('fallback has correct styling', async ({ page }) => {
      const fallback = page.locator('[data-slot="avatar-fallback"]').first()
      await expect(fallback).toHaveClass(/bg-muted/)
      await expect(fallback).toHaveClass(/rounded-full/)
    })
  })

  test.describe('Avatar Group', () => {
    test('displays multiple avatars', async ({ page }) => {
      const avatars = page.locator('[data-slot="avatar"]')
      const count = await avatars.count()
      expect(count).toBeGreaterThanOrEqual(4)
    })
  })
})

test.describe('Avatar Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/avatar')
  })

  test('renders page header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Avatar')
  })

  test('renders playground', async ({ page }) => {
    await expect(page.locator('[data-slot="avatar"]').first()).toBeVisible()
  })

  test('renders API reference section', async ({ page }) => {
    await expect(page.locator('#api-reference')).toBeVisible()
  })
})
