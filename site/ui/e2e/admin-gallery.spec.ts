import { test, expect } from '@playwright/test'

const routes = [
  { path: '/gallery/admin', key: 'overview', title: 'Overview' },
  { path: '/gallery/admin/analytics', key: 'analytics', title: 'Analytics' },
  { path: '/gallery/admin/orders', key: 'orders', title: 'Orders' },
  { path: '/gallery/admin/notifications', key: 'notifications', title: 'Notifications' },
  { path: '/gallery/admin/settings', key: 'settings', title: 'Settings' },
] as const

test.describe('Gallery: Admin app', () => {
  test.describe('Layout', () => {
    test('each route renders the admin shell with the correct title and active sidebar item', async ({ page }) => {
      for (const route of routes) {
        await page.goto(route.path)
        await expect(page.locator('[data-admin-sidebar]')).toBeVisible()
        await expect(page.locator('.admin-page-title')).toHaveText(route.title)

        const active = page.locator(`[data-admin-nav-item="${route.key}"]`)
        await expect(active).toHaveAttribute('data-active', 'true')
        await expect(active).toHaveAttribute('aria-current', 'page')

        const inactiveCount = await page
          .locator('[data-admin-nav-item][data-active="false"]')
          .count()
        expect(inactiveCount).toBe(routes.length - 1)
      }
    })
  })

  test.describe('Navigation', () => {
    test('navigates between every pair of admin routes via the sidebar', async ({ page }) => {
      await page.goto(routes[0].path)

      for (const target of routes) {
        await page.locator(`[data-admin-sidebar] [data-admin-nav-item="${target.key}"]`).click()
        await page.waitForURL(`**${target.path}`)
        await expect(page).toHaveURL(new RegExp(`${target.path}$`))
        await expect(page.locator('.admin-page-title')).toHaveText(target.title)
        await expect(
          page.locator(`[data-admin-nav-item="${target.key}"]`)
        ).toHaveAttribute('data-active', 'true')
      }
    })
  })

  test.describe('Cross-page state', () => {
    test('time range selection persists between overview and analytics', async ({ page }) => {
      await page.goto('/gallery/admin')

      // Change from default (30d) to 90d on overview
      await page.locator('.admin-time-range [data-range="90d"]').click()
      await expect(page.locator('.admin-time-range [data-range="90d"]')).toHaveAttribute(
        'data-active',
        'true'
      )
      await expect(page.locator('.admin-overview-range')).toContainText('Last 90 days')

      // Navigate to analytics via sidebar — the filter should still be 90d
      await page.locator('[data-admin-sidebar] [data-admin-nav-item="analytics"]').click()
      await page.waitForURL('**/gallery/admin/analytics')
      await expect(page.locator('.admin-time-range [data-range="90d"]')).toHaveAttribute(
        'data-active',
        'true'
      )
      await expect(page.locator('.admin-analytics-range')).toContainText('Last 90 days')

      // Switch to 7d on analytics and return to overview
      await page.locator('.admin-time-range [data-range="7d"]').click()
      await expect(page.locator('.admin-analytics-range')).toContainText('Last 7 days')

      await page.locator('[data-admin-sidebar] [data-admin-nav-item="overview"]').click()
      await page.waitForURL('**/gallery/admin')
      await expect(page.locator('.admin-time-range [data-range="7d"]')).toHaveAttribute(
        'data-active',
        'true'
      )
      await expect(page.locator('.admin-overview-range')).toContainText('Last 7 days')
    })

    test('time range is not rendered on routes that do not need it', async ({ page }) => {
      await page.goto('/gallery/admin/orders')
      await expect(page.locator('.admin-time-range')).toHaveCount(0)

      await page.goto('/gallery/admin/settings')
      await expect(page.locator('.admin-time-range')).toHaveCount(0)

      await page.goto('/gallery/admin/notifications')
      await expect(page.locator('.admin-time-range')).toHaveCount(0)
    })

    test('settings tabs switch content (Profile → Team → Notifications)', async ({ page }) => {
      await page.goto('/gallery/admin/settings')

      const profile = page.locator('[role="tab"]', { hasText: 'Profile' })
      const team = page.locator('[role="tab"]', { hasText: 'Team' })
      const notifs = page.locator('[role="tab"]', { hasText: 'Notifications' })

      await expect(profile).toHaveAttribute('data-state', 'active')
      await expect(page.locator('text=Display Name')).toBeVisible()

      await team.click()
      await expect(team).toHaveAttribute('data-state', 'active')
      await expect(profile).toHaveAttribute('data-state', 'inactive')
      await expect(page.locator('text=Team Name')).toBeVisible()

      await notifs.click()
      await expect(notifs).toHaveAttribute('data-state', 'active')
      await expect(team).toHaveAttribute('data-state', 'inactive')
      await expect(page.locator('text=Digest Frequency')).toBeVisible()
    })

    test('gallery meta link is outside the admin shell', async ({ page }) => {
      await page.goto('/gallery/admin')
      const githubLinks = page.locator('a[href*="components/gallery/admin"]')
      await expect(githubLinks).toHaveCount(1)
      // The link must be a sibling of (not descendant of) the admin shell.
      const insideShell = await page
        .locator('.admin-shell a[href*="components/gallery/admin"]')
        .count()
      expect(insideShell).toBe(0)
    })

    test('unread notification count reflects on other pages after navigation', async ({ page }) => {
      await page.goto('/gallery/admin/notifications')

      // Seed: the default dataset has 3 unread notifications, badge should show 3
      await expect(page.locator('.admin-notifications-count')).toHaveText('3')
      await expect(page.locator('.admin-unread-count')).toHaveText('3')

      // Mark all read on notifications page
      await page.locator('.admin-mark-all-read').click()
      await expect(page.locator('.admin-notifications-count')).toHaveCount(0)
      await expect(page.locator('.admin-unread-count')).toHaveCount(0)

      // Navigate to another route and verify the header badge is still cleared
      await page.locator('[data-admin-sidebar] [data-admin-nav-item="overview"]').click()
      await page.waitForURL('**/gallery/admin')
      await expect(page.locator('.admin-unread-count')).toHaveCount(0)

      // Overview exposes a "Notify on-call" button that bumps the unread count.
      // The persisted setter also updates the header on the current page.
      await page.locator('.admin-overview-notify').click()
      await expect(page.locator('.admin-unread-count')).toHaveText('1')

      // Navigating to settings — the header reflects the same value (still 1).
      await page.locator('[data-admin-sidebar] [data-admin-nav-item="settings"]').click()
      await page.waitForURL('**/gallery/admin/settings')
      await expect(page.locator('.admin-unread-count')).toHaveText('1')
    })
  })
})
