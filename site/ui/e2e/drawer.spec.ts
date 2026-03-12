import { test, expect } from '@playwright/test'

// Click position for overlay outside the drawer area.
// Drawers are positioned at edges, so clicking near the opposite edge hits the overlay.
const OVERLAY_CLICK_POSITION = { x: 10, y: 10 }

test.describe('Drawer Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/drawer')
  })

  test.describe('Basic Drawer', () => {
    test('opens drawer when trigger is clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DrawerBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Drawer")')

      await trigger.click()

      // Drawer is portaled to body
      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-basic-title"][data-state="open"]')
      await expect(drawer).toBeVisible()
      await expect(drawer.locator('text=Move Goal').first()).toBeVisible()
    })

    test('closes drawer when DrawerClose button is clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DrawerBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Drawer")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-basic-title"][data-state="open"]')
      await expect(drawer).toBeVisible()

      // Click the Cancel button in footer
      const closeBtn = drawer.locator('[data-slot="drawer-close"]:has-text("Cancel")')
      await closeBtn.click()

      const closedDrawer = page.locator('[role="dialog"][aria-labelledby="drawer-basic-title"][data-state="closed"]').first()
      await expect(closedDrawer).toHaveAttribute('data-state', 'closed')
    })

    test('closes drawer when ESC key is pressed', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DrawerBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Drawer")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-basic-title"][data-state="open"]')
      await expect(drawer).toBeVisible()

      await page.keyboard.press('Escape')

      const closedDrawer = page.locator('[role="dialog"][aria-labelledby="drawer-basic-title"][data-state="closed"]').first()
      await expect(closedDrawer).toHaveAttribute('data-state', 'closed')
    })

    test('closes drawer when overlay is clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DrawerBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Drawer")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-basic-title"][data-state="open"]')
      await expect(drawer).toBeVisible()

      // Click overlay
      const overlay = page.locator('[data-slot="drawer-overlay"][data-state="open"]').first()
      await overlay.click({ position: OVERLAY_CLICK_POSITION })

      const closedDrawer = page.locator('[role="dialog"][aria-labelledby="drawer-basic-title"][data-state="closed"]').first()
      await expect(closedDrawer).toHaveAttribute('data-state', 'closed')
    })

    test('has correct accessibility attributes', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DrawerBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Drawer")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-basic-title"][data-state="open"]')
      await expect(drawer).toBeVisible()
      await expect(drawer).toHaveAttribute('aria-modal', 'true')
      await expect(drawer).toHaveAttribute('aria-labelledby', 'drawer-basic-title')
      await expect(drawer).toHaveAttribute('aria-describedby', 'drawer-basic-description')
    })

    test('displays handle bar', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DrawerBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Drawer")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-basic-title"][data-state="open"]')
      await expect(drawer).toBeVisible()

      const handle = drawer.locator('[data-slot="drawer-handle"]')
      await expect(handle).toBeVisible()
    })

    test('does not show X close button', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DrawerBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Drawer")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-basic-title"][data-state="open"]')
      await expect(drawer).toBeVisible()

      // Drawer should NOT have a close button (X) unlike Sheet
      const closeButton = drawer.locator('[data-slot="drawer-close-button"]')
      await expect(closeButton).toHaveCount(0)
    })

    test('traps focus within drawer', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DrawerBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Drawer")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-basic-title"][data-state="open"]')
      await expect(drawer).toBeVisible()

      // Focus on drawer container
      await drawer.focus()

      // Tab should move focus to the first focusable element inside the drawer
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(() => {
        const el = document.activeElement
        return el ? el.closest('[role="dialog"]')?.getAttribute('aria-labelledby') : null
      })
      expect(focused).toBe('drawer-basic-title')
    })
  })

  test.describe('Direction Variants', () => {
    test('opens bottom drawer', async ({ page }) => {
      const directionDemo = page.locator('[bf-s^="DrawerDirectionDemo_"]').first()
      const trigger = directionDemo.locator('button:has-text("Bottom")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-bottom-title"][data-state="open"]')
      await expect(drawer).toBeVisible()
      await expect(drawer.locator('text=Bottom Drawer')).toBeVisible()

      // Bottom drawer should be at the bottom
      await expect(drawer).toHaveCSS('bottom', '0px')
    })

    test('opens top drawer', async ({ page }) => {
      const directionDemo = page.locator('[bf-s^="DrawerDirectionDemo_"]').first()
      const trigger = directionDemo.locator('button:has-text("Top")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-top-title"][data-state="open"]')
      await expect(drawer).toBeVisible()
      await expect(drawer.locator('text=Top Drawer')).toBeVisible()

      // Top drawer should be at the top
      await expect(drawer).toHaveCSS('top', '0px')
    })

    test('opens right drawer', async ({ page }) => {
      const directionDemo = page.locator('[bf-s^="DrawerDirectionDemo_"]').first()
      const trigger = directionDemo.locator('button:has-text("Right")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-right-title"][data-state="open"]')
      await expect(drawer).toBeVisible()
      await expect(drawer.locator('text=Right Drawer')).toBeVisible()

      // Right drawer should be positioned on the right
      await expect(drawer).toHaveCSS('right', '0px')
    })

    test('opens left drawer', async ({ page }) => {
      const directionDemo = page.locator('[bf-s^="DrawerDirectionDemo_"]').first()
      const trigger = directionDemo.locator('button:has-text("Left")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-left-title"][data-state="open"]')
      await expect(drawer).toBeVisible()
      await expect(drawer.locator('text=Left Drawer')).toBeVisible()

      // Left drawer should be positioned on the left
      await expect(drawer).toHaveCSS('left', '0px')
    })

    test('closes direction drawer via ESC', async ({ page }) => {
      const directionDemo = page.locator('[bf-s^="DrawerDirectionDemo_"]').first()
      const trigger = directionDemo.locator('button:has-text("Left")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-left-title"][data-state="open"]')
      await expect(drawer).toBeVisible()

      await page.keyboard.press('Escape')

      const closedDrawer = page.locator('[role="dialog"][aria-labelledby="drawer-left-title"][data-state="closed"]').first()
      await expect(closedDrawer).toHaveAttribute('data-state', 'closed')
    })
  })

  test.describe('Form Drawer', () => {
    test('opens form drawer with goal controls', async ({ page }) => {
      const formDemo = page.locator('[bf-s^="DrawerFormDemo_"]').first()
      const trigger = formDemo.locator('button:has-text("Set Goal")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-form-title"][data-state="open"]')
      await expect(drawer).toBeVisible()
      await expect(drawer.locator('text=Move Goal').first()).toBeVisible()

      // Check goal display
      await expect(drawer.locator('text=350')).toBeVisible()
      await expect(drawer.locator('text=kcal/day')).toBeVisible()
    })

    test('can adjust goal with buttons', async ({ page }) => {
      const formDemo = page.locator('[bf-s^="DrawerFormDemo_"]').first()
      const trigger = formDemo.locator('button:has-text("Set Goal")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-form-title"][data-state="open"]')
      await expect(drawer).toBeVisible()

      // Click increase button
      const increaseBtn = drawer.locator('button[aria-label="Increase goal"]')
      await increaseBtn.click()

      // Goal should increase by 10
      await expect(drawer.locator('text=360')).toBeVisible()
    })

    test('closes form drawer when Cancel is clicked', async ({ page }) => {
      const formDemo = page.locator('[bf-s^="DrawerFormDemo_"]').first()
      const trigger = formDemo.locator('button:has-text("Set Goal")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-form-title"][data-state="open"]')
      await expect(drawer).toBeVisible()

      const cancelButton = drawer.locator('[data-slot="drawer-close"]:has-text("Cancel")')
      await cancelButton.click()

      const closedDrawer = page.locator('[role="dialog"][aria-labelledby="drawer-form-title"][data-state="closed"]').first()
      await expect(closedDrawer).toHaveAttribute('data-state', 'closed')
    })

    test('closes form drawer when Submit is clicked', async ({ page }) => {
      const formDemo = page.locator('[bf-s^="DrawerFormDemo_"]').first()
      const trigger = formDemo.locator('button:has-text("Set Goal")')

      await trigger.click()

      const drawer = page.locator('[role="dialog"][aria-labelledby="drawer-form-title"][data-state="open"]')
      await expect(drawer).toBeVisible()

      const submitButton = drawer.locator('[data-slot="drawer-close"]:has-text("Submit")')
      await submitButton.click()

      const closedDrawer = page.locator('[role="dialog"][aria-labelledby="drawer-form-title"][data-state="closed"]').first()
      await expect(closedDrawer).toHaveAttribute('data-state', 'closed')
    })
  })

})
