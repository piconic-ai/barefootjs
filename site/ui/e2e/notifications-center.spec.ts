import { test, expect } from '@playwright/test'

test.describe('Notifications Center Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/notifications-center')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="NotificationsCenterDemo_"]:not([data-slot])').first()

  test.describe('Initial Render', () => {
    test('renders header with unread count', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.unread-count')).toBeVisible()
      await expect(s.locator('.unread-count')).toContainText('3')
    })

    test('renders filter tabs with counts', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.filter-all')).toContainText('8')
      await expect(s.locator('.filter-unread')).toContainText('3')
    })

    test('renders all 8 notification items', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.notification-item')).toHaveCount(8)
    })

    test('renders type badges', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.type-badge').first()).toBeVisible()
    })

    test('unread notifications have unread dot', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.unread-dot')).toHaveCount(3)
    })
  })

  test.describe('Filter Tabs', () => {
    test('unread filter shows only unread', async ({ page }) => {
      const s = section(page)
      await s.locator('.filter-unread').click()
      await expect(s.locator('.notification-item')).toHaveCount(3)
    })

    test('mentions filter shows only mentions', async ({ page }) => {
      const s = section(page)
      await s.locator('.filter-mentions').click()
      await expect(s.locator('.notification-item')).toHaveCount(2)
    })

    test('all filter restores full list', async ({ page }) => {
      const s = section(page)
      await s.locator('.filter-unread').click()
      await expect(s.locator('.notification-item')).toHaveCount(3)
      await s.locator('.filter-all').click()
      await expect(s.locator('.notification-item')).toHaveCount(8)
    })
  })

  test.describe('Read/Unread Toggle', () => {
    test('clicking read button reduces unread count', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.unread-count')).toContainText('3')
      await s.locator('.toggle-read-btn').first().click()
      await expect(s.locator('.unread-count')).toContainText('2')
    })

    test('clicking read removes unread dot', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.unread-dot')).toHaveCount(3)
      await s.locator('.toggle-read-btn').first().click()
      await expect(s.locator('.unread-dot')).toHaveCount(2)
    })
  })

  test.describe('Dismiss', () => {
    test('dismiss removes notification', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.notification-item')).toHaveCount(8)
      await s.locator('.dismiss-btn').first().click()
      await expect(s.locator('.notification-item')).toHaveCount(7)
    })
  })

  test.describe('Bulk Actions', () => {
    test('mark all read clears unread dots', async ({ page }) => {
      const s = section(page)
      await s.locator('.mark-all-read-btn').click()
      await expect(s.locator('.unread-dot')).toHaveCount(0)
    })

    test('mark all read disables the button', async ({ page }) => {
      const s = section(page)
      await s.locator('.mark-all-read-btn').click()
      await expect(s.locator('.mark-all-read-btn')).toBeDisabled()
    })

    test('clear all removes all notifications', async ({ page }) => {
      const s = section(page)
      await s.locator('.clear-all-btn').click()
      await expect(s.locator('.notification-item')).toHaveCount(0)
    })

    test('clear all shows empty state', async ({ page }) => {
      const s = section(page)
      await s.locator('.clear-all-btn').click()
      await expect(s.locator('.empty-state')).toBeVisible()
    })
  })

  test.describe('Streaming', () => {
    test('start stream adds new notifications', async ({ page }) => {
      const s = section(page)
      await s.locator('.stream-btn').click()
      // Wait for at least one notification to arrive (3s interval)
      await expect(s.locator('.notification-item')).toHaveCount(9, { timeout: 5000 })
    })

    test('stop stream stops adding notifications', async ({ page }) => {
      const s = section(page)
      await s.locator('.stream-btn').click()
      await expect(s.locator('.notification-item')).toHaveCount(9, { timeout: 5000 })
      // Stop streaming
      await s.locator('.stream-btn').click()
      const countAfterStop = await s.locator('.notification-item').count()
      // Wait and verify count stays stable
      await page.waitForTimeout(4000)
      await expect(s.locator('.notification-item')).toHaveCount(countAfterStop)
    })

    test('stream button text toggles', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.stream-btn')).toContainText('Start Stream')
      await s.locator('.stream-btn').click()
      await expect(s.locator('.stream-btn')).toContainText('Stop Stream')
    })
  })

  test.describe('Empty State', () => {
    test('empty state shows when no notifications match filter', async ({ page }) => {
      const s = section(page)
      await s.locator('.mark-all-read-btn').click()
      await s.locator('.filter-unread').click()
      await expect(s.locator('.empty-state')).toBeVisible()
    })
  })
})
