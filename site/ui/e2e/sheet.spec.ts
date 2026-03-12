import { test, expect } from '@playwright/test'

// Click position for overlay outside the sheet area.
// Sheets are positioned at edges, so clicking near the opposite edge hits the overlay.
const OVERLAY_CLICK_POSITION = { x: 10, y: 10 }

test.describe('Sheet Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/sheet')
  })

  test.describe('Basic Sheet', () => {
    test('opens sheet when trigger is clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SheetBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Sheet")')

      await trigger.click()

      // Sheet is portaled to body
      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="open"]')
      await expect(sheet).toBeVisible()
      await expect(sheet.locator('text=Sheet Title')).toBeVisible()
    })

    test('closes sheet when close button (X) is clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SheetBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Sheet")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="open"]')
      await expect(sheet).toBeVisible()

      // Click the X close button
      const closeButton = sheet.locator('[data-slot="sheet-close-button"]')
      await closeButton.click()

      // Sheet should transition to closed state
      const closedSheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="closed"]').first()
      await expect(closedSheet).toHaveAttribute('data-state', 'closed')
    })

    test('closes sheet when SheetClose button is clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SheetBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Sheet")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="open"]')
      await expect(sheet).toBeVisible()

      // Click the Close button in footer
      const closeBtn = sheet.locator('[data-slot="sheet-close"]:has-text("Close")')
      await closeBtn.click()

      const closedSheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="closed"]').first()
      await expect(closedSheet).toHaveAttribute('data-state', 'closed')
    })

    test('closes sheet when ESC key is pressed', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SheetBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Sheet")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="open"]')
      await expect(sheet).toBeVisible()

      await page.keyboard.press('Escape')

      const closedSheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="closed"]').first()
      await expect(closedSheet).toHaveAttribute('data-state', 'closed')
    })

    test('closes sheet when overlay is clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SheetBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Sheet")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="open"]')
      await expect(sheet).toBeVisible()

      // Click overlay
      const overlay = page.locator('[data-slot="sheet-overlay"][data-state="open"]').first()
      await overlay.click({ position: OVERLAY_CLICK_POSITION })

      const closedSheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="closed"]').first()
      await expect(closedSheet).toHaveAttribute('data-state', 'closed')
    })

    test('has correct accessibility attributes', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SheetBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Sheet")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="open"]')
      await expect(sheet).toBeVisible()
      await expect(sheet).toHaveAttribute('aria-modal', 'true')
      await expect(sheet).toHaveAttribute('aria-labelledby', 'sheet-basic-title')
      await expect(sheet).toHaveAttribute('aria-describedby', 'sheet-basic-description')
    })

    test('traps focus within sheet', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SheetBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Sheet")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="open"]')
      await expect(sheet).toBeVisible()

      // Focus on sheet container
      await sheet.focus()

      // Tab should move focus to the first focusable element inside the sheet
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(() => {
        const el = document.activeElement
        return el ? el.closest('[role="dialog"]')?.getAttribute('aria-labelledby') : null
      })
      expect(focused).toBe('sheet-basic-title')
    })
  })

  test.describe('Sheet Slide Animation', () => {
    test('right sheet slides in from right', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SheetBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Open Sheet")')

      // Before opening, sheet should be translated off-screen (translate-x-full)
      const closedSheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="closed"]').first()
      await expect(closedSheet).toHaveClass(/translate-x-full/)

      await trigger.click()

      const openSheet = page.locator('[role="dialog"][aria-labelledby="sheet-basic-title"][data-state="open"]')
      await expect(openSheet).toBeVisible()

      // Verify the sheet has translate-x-0 class applied (no x-translation from slide)
      await expect(openSheet).toHaveClass(/translate-x-0/)
    })
  })

  test.describe('Side Variants', () => {
    test('opens left sheet', async ({ page }) => {
      const sideDemo = page.locator('[bf-s^="SheetSideDemo_"]').first()
      const trigger = sideDemo.locator('button:has-text("Left")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-left-title"][data-state="open"]')
      await expect(sheet).toBeVisible()
      await expect(sheet.locator('text=Left Sheet')).toBeVisible()

      // Left sheet should be positioned on the left
      await expect(sheet).toHaveCSS('left', '0px')
    })

    test('opens right sheet', async ({ page }) => {
      const sideDemo = page.locator('[bf-s^="SheetSideDemo_"]').first()
      const trigger = sideDemo.locator('button:has-text("Right")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-right-title"][data-state="open"]')
      await expect(sheet).toBeVisible()
      await expect(sheet.locator('text=Right Sheet')).toBeVisible()

      // Right sheet should be positioned on the right
      await expect(sheet).toHaveCSS('right', '0px')
    })

    test('opens top sheet', async ({ page }) => {
      const sideDemo = page.locator('[bf-s^="SheetSideDemo_"]').first()
      const trigger = sideDemo.locator('button:has-text("Top")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-top-title"][data-state="open"]')
      await expect(sheet).toBeVisible()
      await expect(sheet.locator('text=Top Sheet')).toBeVisible()

      // Top sheet should be at the top
      await expect(sheet).toHaveCSS('top', '0px')
    })

    test('opens bottom sheet', async ({ page }) => {
      const sideDemo = page.locator('[bf-s^="SheetSideDemo_"]').first()
      const trigger = sideDemo.locator('button:has-text("Bottom")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-bottom-title"][data-state="open"]')
      await expect(sheet).toBeVisible()
      await expect(sheet.locator('text=Bottom Sheet')).toBeVisible()

      // Bottom sheet should be at the bottom
      await expect(sheet).toHaveCSS('bottom', '0px')
    })

    test('closes side sheet via ESC', async ({ page }) => {
      const sideDemo = page.locator('[bf-s^="SheetSideDemo_"]').first()
      const trigger = sideDemo.locator('button:has-text("Left")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-left-title"][data-state="open"]')
      await expect(sheet).toBeVisible()

      await page.keyboard.press('Escape')

      const closedSheet = page.locator('[role="dialog"][aria-labelledby="sheet-left-title"][data-state="closed"]').first()
      await expect(closedSheet).toHaveAttribute('data-state', 'closed')
    })
  })

  test.describe('Form Sheet', () => {
    test('opens form sheet with input fields', async ({ page }) => {
      const formDemo = page.locator('[bf-s^="SheetFormDemo_"]').first()
      const trigger = formDemo.locator('button:has-text("Edit Profile")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-form-title"][data-state="open"]')
      await expect(sheet).toBeVisible()
      await expect(sheet.locator('text=Edit Profile').first()).toBeVisible()

      // Check input fields are present
      const nameInput = sheet.locator('input#sheet-name')
      await expect(nameInput).toBeVisible()

      const usernameInput = sheet.locator('input#sheet-username')
      await expect(usernameInput).toBeVisible()
    })

    test('can interact with form fields inside sheet', async ({ page }) => {
      const formDemo = page.locator('[bf-s^="SheetFormDemo_"]').first()
      const trigger = formDemo.locator('button:has-text("Edit Profile")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-form-title"][data-state="open"]')
      await expect(sheet).toBeVisible()

      // Clear and type in name input
      const nameInput = sheet.locator('input#sheet-name')
      await nameInput.click()
      await nameInput.fill('Jane Smith')
      await expect(nameInput).toHaveValue('Jane Smith')
    })

    test('closes form sheet when Cancel is clicked', async ({ page }) => {
      const formDemo = page.locator('[bf-s^="SheetFormDemo_"]').first()
      const trigger = formDemo.locator('button:has-text("Edit Profile")')

      await trigger.click()

      const sheet = page.locator('[role="dialog"][aria-labelledby="sheet-form-title"][data-state="open"]')
      await expect(sheet).toBeVisible()

      const cancelButton = sheet.locator('[data-slot="sheet-close"]:has-text("Cancel")')
      await cancelButton.click()

      const closedSheet = page.locator('[role="dialog"][aria-labelledby="sheet-form-title"][data-state="closed"]').first()
      await expect(closedSheet).toHaveAttribute('data-state', 'closed')
    })
  })

})
