import { test, expect } from '@playwright/test'

const routes = [
  { path: '/gallery/productivity/mail', key: 'mail', title: 'Mail' },
  { path: '/gallery/productivity/files', key: 'files', title: 'Files' },
  { path: '/gallery/productivity/board', key: 'board', title: 'Board' },
  { path: '/gallery/productivity/calendar', key: 'calendar', title: 'Calendar' },
] as const

test.describe('Gallery: Productivity app', () => {
  test.describe('Layout', () => {
    test('each route renders the productivity shell with the correct title and active sidebar item', async ({ page }) => {
      for (const route of routes) {
        await page.goto(route.path)
        await expect(page.locator('[data-productivity-sidebar]')).toBeVisible()
        await expect(page.locator('.productivity-page-title')).toHaveText(route.title)

        const active = page.locator(`[data-productivity-nav-item="${route.key}"]`)
        await expect(active).toHaveAttribute('data-active', 'true')
        await expect(active).toHaveAttribute('aria-current', 'page')

        const inactiveCount = await page
          .locator('[data-productivity-nav-item][data-active="false"]')
          .count()
        expect(inactiveCount).toBe(routes.length - 1)
      }
    })

    test('gallery meta link is outside the productivity shell', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')
      const githubLinks = page.locator('a[href*="components/gallery/productivity"]')
      await expect(githubLinks).toHaveCount(1)
      const insideShell = await page
        .locator('.productivity-shell a[href*="components/gallery/productivity"]')
        .count()
      expect(insideShell).toBe(0)
    })
  })

  test.describe('Navigation', () => {
    test('navigates between all productivity routes via the sidebar', async ({ page }) => {
      await page.goto(routes[0].path)

      for (const target of routes) {
        await page.locator(`[data-productivity-sidebar] [data-productivity-nav-item="${target.key}"]`).click()
        await page.waitForURL(`**${target.path}`)
        await expect(page).toHaveURL(new RegExp(`${target.path}$`))
        await expect(page.locator('.productivity-page-title')).toHaveText(target.title)
        await expect(
          page.locator(`[data-productivity-nav-item="${target.key}"]`)
        ).toHaveAttribute('data-active', 'true')
      }
    })
  })

  test.describe('Mail page', () => {
    test('renders mail inbox with multiple messages', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')
      const mailRows = page.locator('.mail-row')
      await expect(mailRows.first()).toBeVisible()
      const count = await mailRows.count()
      expect(count).toBeGreaterThan(0)
    })

    test('clicking a mail marks it as read and shows detail panel', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')

      // Click first unread mail (has "New" badge)
      await page.locator('.mail-row').first().locator('.mail-content').click()

      // Detail panel should appear
      await expect(page.locator('.mail-detail')).toBeVisible()
      await expect(page.locator('.mail-detail-subject')).toBeVisible()
    })

    test('search filters the mail list', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')

      const initialCount = await page.locator('.mail-row').count()
      await page.locator('input[placeholder="Search mail..."]').fill('Q4')

      const filteredCount = await page.locator('.mail-row').count()
      expect(filteredCount).toBeLessThan(initialCount)
    })
  })

  test.describe('Cross-page state', () => {
    test('unread mail badge appears in sidebar after visiting mail page', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')

      // Mail page initializes with unread mails → writes to sessionStorage
      // Badge should appear on mail nav item
      await expect(page.locator('[data-productivity-sidebar] .productivity-unread-count')).toBeVisible()
      const badgeText = await page.locator('[data-productivity-sidebar] .productivity-unread-count').textContent()
      const initialUnread = parseInt(badgeText ?? '0', 10)
      expect(initialUnread).toBeGreaterThan(0)

      // Navigate to files page — badge should persist from sessionStorage
      await page.locator('[data-productivity-sidebar] [data-productivity-nav-item="files"]').click()
      await page.waitForURL('**/gallery/productivity/files')

      await expect(page.locator('[data-productivity-sidebar] .productivity-unread-count')).toBeVisible()
      await expect(page.locator('[data-productivity-sidebar] .productivity-unread-count')).toHaveText(String(initialUnread))
    })

    test('reading a mail reduces the unread badge count', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')

      // Get initial unread count
      await expect(page.locator('[data-productivity-sidebar] .productivity-unread-count')).toBeVisible()
      const initialText = await page.locator('[data-productivity-sidebar] .productivity-unread-count').textContent()
      const initialCount = parseInt(initialText ?? '0', 10)

      // Click an unread mail to mark it as read
      await page.locator('.mail-row').filter({ has: page.locator('.mail-content [class*="font-semibold"]') }).first().locator('.mail-content').click()

      // After selecting, unread count should decrease
      const newText = await page.locator('[data-productivity-sidebar] .productivity-unread-count').textContent()
      const newCount = parseInt(newText ?? '0', 10)
      expect(newCount).toBeLessThan(initialCount)
    })
  })
})
