import { test, expect } from '@playwright/test'

test.describe('Toast Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/toast')
  })

  test.describe('Default Toast', () => {
    test('opens toast when button is clicked', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastDefaultDemo_"]').first()
      const trigger = demo.locator('button:has-text("Default")')

      await trigger.click()

      // Toast is portaled to body, search globally
      const toast = page.locator('[data-slot="toast"][data-state="visible"]').first()
      await expect(toast).toBeVisible()
      await expect(toast.locator('[data-slot="toast-description"]')).toContainText('Sunday, December 03, 2023')
    })

    test('closes toast when close button is clicked', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastDefaultDemo_"]').first()
      const trigger = demo.locator('button:has-text("Default")')

      await trigger.click()

      // Wait for toast to become visible
      const toast = page.locator('[data-slot="toast"][data-state="visible"]').first()
      await expect(toast).toBeVisible()

      // Get a stable reference that won't break when data-state changes
      const toastBySlot = page.locator('[data-slot="toast"]').first()
      const closeButton = toastBySlot.locator('[data-slot="toast-close"]')
      await closeButton.click()

      // Toast should transition to hidden
      await expect(toastBySlot).toHaveAttribute('data-state', 'hidden')
    })

    test('has correct accessibility attributes', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastDefaultDemo_"]').first()
      const trigger = demo.locator('button:has-text("Default")')

      await trigger.click()

      const toast = page.locator('[data-slot="toast"][data-state="visible"]').first()
      await expect(toast).toBeVisible()
      await expect(toast).toHaveAttribute('role', 'status')
      await expect(toast).toHaveAttribute('aria-live', 'polite')
    })
  })

  test.describe('Error Toast', () => {
    test('displays error variant with assertive aria-live', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastErrorDemo_"]').first()
      const trigger = demo.locator('button:has-text("Error")')

      await trigger.click()

      const toast = page.locator('[data-slot="toast"][data-variant="error"][data-state="visible"]').first()
      await expect(toast).toBeVisible()
      await expect(toast).toHaveAttribute('role', 'alert')
      await expect(toast).toHaveAttribute('aria-live', 'assertive')
      await expect(toast.locator('[data-slot="toast-title"]')).toContainText('Something went wrong')
    })

    test('action button dismisses toast', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastErrorDemo_"]').first()
      const trigger = demo.locator('button:has-text("Error")')

      await trigger.click()

      const toast = page.locator('[data-slot="toast"][data-variant="error"][data-state="visible"]').first()
      await expect(toast).toBeVisible()

      // Get stable reference before state changes
      const toastBySlot = page.locator('[data-slot="toast"][data-variant="error"]').first()
      const actionButton = toastBySlot.locator('[data-slot="toast-action"]')
      await expect(actionButton).toContainText('Try again')
      await actionButton.click()

      await expect(toastBySlot).toHaveAttribute('data-state', 'hidden')
    })
  })

  test.describe('Toast with Action', () => {
    test('displays action button', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastWithActionDemo_"]').first()
      const trigger = demo.locator('button:has-text("Delete Item")')

      await trigger.click()

      const toast = page.locator('[data-slot="toast"][data-state="visible"]').first()
      await expect(toast).toBeVisible()

      const actionButton = toast.locator('[data-slot="toast-action"]')
      await expect(actionButton).toBeVisible()
      await expect(actionButton).toContainText('Undo')
    })

    test('action button closes toast when clicked', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastWithActionDemo_"]').first()
      const trigger = demo.locator('button:has-text("Delete Item")')

      await trigger.click()

      const toast = page.locator('[data-slot="toast"][data-state="visible"]').first()
      await expect(toast).toBeVisible()

      // Use the visible toast's action button directly, then verify via stable locator
      const actionButton = toast.locator('[data-slot="toast-action"]')
      await actionButton.click()

      // Locate the toast that has the undo action (stable selector without data-state)
      const toastWithAction = page.locator('[data-slot="toast"]:has([data-slot="toast-action"][aria-label="Undo deletion"])').first()
      await expect(toastWithAction).toHaveAttribute('data-state', 'hidden')
    })
  })

  test.describe('Toast Animations', () => {
    test('shows toast with visible state after entering', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastDefaultDemo_"]').first()
      const trigger = demo.locator('button:has-text("Default")')

      await trigger.click()

      // After rAF, toast should be in visible state
      const toast = page.locator('[data-slot="toast"][data-state="visible"]').first()
      await expect(toast).toBeVisible()
    })

    test('slides out when dismissed and transitions to hidden', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastDefaultDemo_"]').first()
      const trigger = demo.locator('button:has-text("Default")')

      await trigger.click()

      const toast = page.locator('[data-slot="toast"][data-state="visible"]').first()
      await expect(toast).toBeVisible()

      // Get stable reference before state changes
      const toastBySlot = page.locator('[data-slot="toast"]').first()
      const closeButton = toastBySlot.locator('[data-slot="toast-close"]')
      await closeButton.click()

      // Should transition through exiting to hidden
      await expect(toastBySlot).toHaveAttribute('data-state', 'hidden')
    })

    test('toast has transition classes for animation', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastDefaultDemo_"]').first()
      const trigger = demo.locator('button:has-text("Default")')

      await trigger.click()

      const toast = page.locator('[data-slot="toast"][data-state="visible"]').first()
      await expect(toast).toBeVisible()
      await expect(toast).toHaveClass(/transition-all/)
      await expect(toast).toHaveClass(/duration-slow/)
    })
  })

  test.describe('Variant Icons', () => {
    test('success toast displays check icon', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastSuccessDemo_"]').first()
      const trigger = demo.locator('button:has-text("Success")')

      await trigger.click()

      const toast = page.locator('[data-slot="toast"][data-variant="success"][data-state="visible"]').first()
      await expect(toast).toBeVisible()
      await expect(toast.locator('svg').first()).toBeVisible()
    })

    test('error toast displays icon', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastErrorDemo_"]').first()
      const trigger = demo.locator('button:has-text("Error")')

      await trigger.click()

      const toast = page.locator('[data-slot="toast"][data-variant="error"][data-state="visible"]').first()
      await expect(toast).toBeVisible()
      await expect(toast.locator('svg').first()).toBeVisible()
    })

    test('default toast has no variant icon', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastDefaultDemo_"]').first()
      const trigger = demo.locator('button:has-text("Default")')

      await trigger.click()

      const toast = page.locator('[data-slot="toast"][data-variant="default"][data-state="visible"]').first()
      await expect(toast).toBeVisible()
      // Default variant should not have a variant icon (only the close button icon)
      // The close button's SVG is inside [data-slot="toast-close"], so variant icons are direct children
      const variantIcon = toast.locator(':scope > svg')
      await expect(variantIcon).toHaveCount(0)
    })
  })

  test.describe('Position Demo', () => {
    test('displays position buttons', async ({ page }) => {
      const demo = page.locator('[bf-s^="ToastPositionDemo_"]').first()
      await expect(demo.locator('button:has-text("Top Left")')).toBeVisible()
      await expect(demo.locator('button:has-text("Top Center")')).toBeVisible()
      await expect(demo.locator('button:has-text("Top Right")')).toBeVisible()
      await expect(demo.locator('button:has-text("Bottom Left")')).toBeVisible()
      await expect(demo.locator('button:has-text("Bottom Center")')).toBeVisible()
      await expect(demo.locator('button:has-text("Bottom Right")')).toBeVisible()
    })
  })

})
