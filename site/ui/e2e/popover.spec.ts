import { test, expect } from '@playwright/test'

test.describe('Popover Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/popover')
  })

  test.describe('Preview Demo', () => {
    test('opens popover on trigger click', async ({ page }) => {
      const demo = page.locator('[bf-s^="PopoverPreviewDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="popover-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="popover-content"][data-state="open"]')
      await expect(content).toBeVisible()
      await expect(content.getByRole('heading', { name: 'Dimensions' })).toBeVisible()
    })

    test('closes on ESC', async ({ page }) => {
      const demo = page.locator('[bf-s^="PopoverPreviewDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="popover-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="popover-content"][data-state="open"]')
      await expect(content).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(content).toHaveCount(0)
    })

    test('closes on click outside', async ({ page }) => {
      const demo = page.locator('[bf-s^="PopoverPreviewDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="popover-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="popover-content"][data-state="open"]')
      await expect(content).toBeVisible()

      // Click outside the popover (on the page header)
      await page.locator('h1').click()
      await expect(content).toHaveCount(0)
    })

    test('has correct data-state transitions', async ({ page }) => {
      const demo = page.locator('[bf-s^="PopoverPreviewDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="popover-trigger"]')

      // Initially closed. Scoped by `bf-h` (this instance's own host prefix),
      // not `.first()` in document order: the portal-placed content of every
      // Popover instance on this page (including the Playground demo's own)
      // now shares one outlet, so document order no longer matches the
      // page's visual section order — `.first()` picked a DIFFERENT
      // instance's content once #3059 moved portal content into that outlet.
      const content = page.locator('[data-slot="popover-content"][bf-h^="PopoverPreviewDemo_"]')
      await expect(content).toHaveAttribute('data-state', 'closed')

      // Open
      await trigger.click()
      await expect(content).toHaveAttribute('data-state', 'open')

      // Close
      await page.keyboard.press('Escape')
      await expect(content).toHaveAttribute('data-state', 'closed')
    })

    test('has correct aria-expanded on trigger', async ({ page }) => {
      const demo = page.locator('[bf-s^="PopoverPreviewDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="popover-trigger"]')

      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')

      await page.keyboard.press('Escape')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })

    test('contains form fields', async ({ page }) => {
      const demo = page.locator('[bf-s^="PopoverPreviewDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="popover-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="popover-content"][data-state="open"]')
      await expect(content.getByText('Width', { exact: true })).toBeVisible()
      await expect(content.getByText('Height', { exact: true })).toBeVisible()
    })
  })

  test.describe('Basic Demo', () => {
    test('opens and shows content', async ({ page }) => {
      const demo = page.locator('[bf-s^="PopoverBasicDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="popover-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="popover-content"][data-state="open"]')
      await expect(content).toBeVisible()
      await expect(content.locator('text=About')).toBeVisible()
    })
  })

  test.describe('Form Demo', () => {
    test('opens and shows form', async ({ page }) => {
      const demo = page.locator('[bf-s^="PopoverFormDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="popover-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="popover-content"][data-state="open"]')
      await expect(content).toBeVisible()
      await expect(content.getByRole('heading', { name: 'Notifications' })).toBeVisible()
    })

    test('PopoverClose button closes popover', async ({ page }) => {
      const demo = page.locator('[bf-s^="PopoverFormDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="popover-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="popover-content"][data-state="open"]')
      await expect(content).toBeVisible()

      // Click the Cancel button (PopoverClose)
      const closeBtn = content.locator('[data-slot="popover-close"]')
      await closeBtn.click()

      await expect(content).toHaveCount(0)
    })
  })

})
