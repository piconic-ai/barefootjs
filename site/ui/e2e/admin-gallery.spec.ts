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

    test('source-stat cards carry inline `--stat-c` CSS variable per item', async ({ page }) => {
      // CSS-var × .map() × per-item reactive coverage. Each source's
      // accent comes from the per-item `s.accent` value, not a class
      // swap, so the only attribute that varies across cards is the
      // inline `style="--stat-c: ..."`.
      await page.goto('/gallery/admin/analytics')

      const grid = page.locator('[data-source-stat-grid]')
      await expect(grid).toBeVisible()
      await expect(grid.locator('[data-source-stat]')).toHaveCount(5)

      const organic = grid.locator('[data-source-stat="organic"]')
      const direct = grid.locator('[data-source-stat="direct"]')
      const paid = grid.locator('[data-source-stat="paid"]')

      // Inline style carries the per-source colour as a CSS custom property.
      await expect(organic).toHaveAttribute('style', /--stat-c\s*:\s*hsl\(142/)
      await expect(direct).toHaveAttribute('style', /--stat-c\s*:\s*hsl\(221/)
      await expect(paid).toHaveAttribute('style', /--stat-c\s*:\s*hsl\(38/)

      // Resolved `color` on the share badge picks up the same variable.
      const share = organic.locator('[data-source-share]')
      await expect(share).toBeVisible()
      const color = await share.evaluate((el) => getComputedStyle(el).color)
      // hsl(142 71% 45%) → close to rgb(33, 197, 94). Just assert green-ish.
      expect(color).toMatch(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    })

    test('each .map() item carries its own `--stat-c` value (no shared style)', async ({ page }) => {
      // Locks the per-item CSS variable contract: five sibling cards
      // produced by a single `.map()` must end up with five DIFFERENT
      // inline `--stat-c` values, proving that the compiler emits a
      // per-item style binding rather than collapsing the spread into a
      // module-level constant.
      await page.goto('/gallery/admin/analytics')

      const cards = page.locator('[data-source-stat-grid] [data-source-stat]')
      await expect(cards).toHaveCount(5)

      const styles = await cards.evaluateAll((nodes) =>
        nodes.map((el) => el.getAttribute('style') ?? ''),
      )
      // All five inline styles must be unique — no two cards share an accent.
      expect(new Set(styles).size).toBe(5)
      // Each style is a real CSS string, not the legacy `[object Object]`
      // fallback from applyRestAttrs' pre-#135 path.
      for (const s of styles) {
        expect(s).toMatch(/^--stat-c\s*:\s*hsl\(/)
      }
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
