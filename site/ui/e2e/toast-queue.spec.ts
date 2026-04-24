import { test, expect } from '@playwright/test'

test.describe('Toast Queue Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/toast-queue')
  })

  const demo = (page: any) =>
    page.locator('[bf-s^="ToastQueueDemo_"]:not([data-slot])').first()

  const toastProvider = (page: any) =>
    page.locator('body > [data-slot="toast-provider"]')

  const portalToasts = (page: any) =>
    toastProvider(page).locator('[data-slot="toast"]')

  test('adds a batch through ToastProvider without overlapping variable-height toasts', async ({ page }) => {
    const d = demo(page)

    await d.locator('[data-slot="add-batch"]').click()

    await expect(portalToasts(page)).toHaveCount(4)
    await expect(toastProvider(page)).toHaveAttribute('bf-po', /.+/)
    await expect(portalToasts(page).filter({ hasText: 'Invoice paid' })).toBeVisible()
    await expect(portalToasts(page).filter({ hasText: 'Build finished' })).toBeVisible()
    await expect(portalToasts(page).filter({ hasText: 'Storage threshold' })).toBeVisible()
    await expect(portalToasts(page).filter({ hasText: 'Webhook failed' })).toBeVisible()
    await expect(d.locator('.queue-active-count')).toContainText('4')
    await expect(d.locator('.queue-top-variant')).toContainText('error')

    const boxes = await portalToasts(page).evaluateAll(elements =>
      elements.map(el => {
        const rect = el.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom }
      }),
    )

    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i - 1].bottom).toBeLessThanOrEqual(boxes[i].top - 8)
    }
  })

  test('manual dismiss transitions one toast out and removes it from the provider', async ({ page }) => {
    const d = demo(page)

    await d.locator('[data-slot="add-batch"]').click()
    await expect(portalToasts(page)).toHaveCount(4)

    await portalToasts(page).first().locator('[data-slot="toast-close"]').click()

    await expect(d.locator('.queue-exiting-count')).toContainText('1')
    await expect(portalToasts(page)).toHaveCount(3, { timeout: 2000 })
    await expect(d.locator('.queue-active-count')).toContainText('3')
  })

  test('clear queue dynamically unmounts every toast', async ({ page }) => {
    const d = demo(page)

    await d.locator('[data-slot="add-batch"]').click()
    await expect(portalToasts(page)).toHaveCount(4)

    await d.locator('[data-slot="clear-queue"]').click()

    await expect(d.locator('.queue-exiting-count')).toContainText('4')
    await expect(portalToasts(page)).toHaveCount(0, { timeout: 2500 })
    await expect(d.locator('[data-slot="empty-queue"]')).toBeVisible()
  })

  test('auto-dismiss removes toast after its per-toast timer', async ({ page }) => {
    const d = demo(page)

    await d.locator('[data-slot="add-batch"]').click()
    await expect(portalToasts(page)).toHaveCount(4)

    await expect(portalToasts(page)).toHaveCount(3, { timeout: 5500 })
    await expect(d.locator('.queue-active-count')).toContainText('3')
  })

  test('urgent toast prepends and event log records dismissal', async ({ page }) => {
    const d = demo(page)

    await d.locator('[data-slot="add-urgent"]').click()
    await expect(portalToasts(page)).toHaveCount(1)
    await expect(portalToasts(page).first()).toContainText('Incident escalated')
    await expect(d.locator('.queue-top-variant')).toContainText('error')
    await expect(d.locator('[data-slot="event-log"]')).toContainText('Added error toast')

    await portalToasts(page).first().locator('[data-slot="toast-close"]').click()
    await expect(d.locator('[data-slot="event-log"]')).toContainText('Dismissed toast')
  })
})
