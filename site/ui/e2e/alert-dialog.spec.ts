import { test, expect } from '@playwright/test'

// Click position for overlay outside the alert dialog area.
const OVERLAY_CLICK_POSITION = { x: 10, y: 10 }

// Scope triggers to specific page sections to avoid matching Playground instances.
const BASIC_TRIGGER = '#usage button:has-text("Show Dialog")'
const BASIC_DIALOG = '[role="alertdialog"][aria-labelledby="alert-basic-title"]'
const DESTRUCTIVE_TRIGGER = '#examples button:has-text("Delete Account")'
const DESTRUCTIVE_DIALOG = '[role="alertdialog"][aria-labelledby="alert-destructive-title"]'

test.describe('AlertDialog Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/alert-dialog')
  })

  test.describe('Basic AlertDialog', () => {
    test('opens alert dialog when trigger is clicked', async ({ page }) => {
      const trigger = page.locator(BASIC_TRIGGER).first()

      await trigger.click()

      // AlertDialog is portaled to body
      const alertDialog = page.locator(`${BASIC_DIALOG}[data-state="open"]`)
      await expect(alertDialog).toBeVisible()
      await expect(alertDialog.locator('text=Are you absolutely sure?')).toBeVisible()
    })

    test('has role="alertdialog" instead of role="dialog"', async ({ page }) => {
      const trigger = page.locator(BASIC_TRIGGER).first()

      await trigger.click()

      const alertDialog = page.locator('[role="alertdialog"][data-state="open"]')
      await expect(alertDialog).toBeVisible()
      await expect(alertDialog).toHaveAttribute('role', 'alertdialog')
    })

    test('closes alert dialog when Cancel button is clicked', async ({ page }) => {
      const trigger = page.locator(BASIC_TRIGGER).first()

      await trigger.click()

      const openDialog = page.locator(`${BASIC_DIALOG}[data-state="open"]`)
      await expect(openDialog).toBeVisible()

      const cancelButton = openDialog.locator('button:has-text("Cancel")')
      await cancelButton.click()

      const closedDialog = page.locator(`${BASIC_DIALOG}[data-state="closed"]`).first()
      await expect(closedDialog).toHaveCSS('opacity', '0')
    })

    test('closes alert dialog when Action button is clicked', async ({ page }) => {
      const trigger = page.locator(BASIC_TRIGGER).first()

      await trigger.click()

      const openDialog = page.locator(`${BASIC_DIALOG}[data-state="open"]`)
      await expect(openDialog).toBeVisible()

      const actionButton = openDialog.locator('button:has-text("Continue")')
      await actionButton.click()

      const closedDialog = page.locator(`${BASIC_DIALOG}[data-state="closed"]`).first()
      await expect(closedDialog).toHaveCSS('opacity', '0')
    })

    test('closes alert dialog when ESC key is pressed', async ({ page }) => {
      const trigger = page.locator(BASIC_TRIGGER).first()

      await trigger.click()

      const openDialog = page.locator(`${BASIC_DIALOG}[data-state="open"]`)
      await expect(openDialog).toBeVisible()

      await page.keyboard.press('Escape')

      const closedDialog = page.locator(`${BASIC_DIALOG}[data-state="closed"]`).first()
      await expect(closedDialog).toHaveCSS('opacity', '0')
    })

    test('does NOT close when overlay is clicked', async ({ page }) => {
      const trigger = page.locator(BASIC_TRIGGER).first()

      await trigger.click()

      const openDialog = page.locator(`${BASIC_DIALOG}[data-state="open"]`)
      await expect(openDialog).toBeVisible()

      // Click the overlay
      const overlay = page.locator('[data-slot="alert-dialog-overlay"][data-state="open"]').first()
      await overlay.click({ position: OVERLAY_CLICK_POSITION })

      // Alert dialog should STILL be open (key difference from Dialog)
      await expect(openDialog).toBeVisible()
      await expect(openDialog).toHaveCSS('opacity', '1')
    })

    test('has correct accessibility attributes', async ({ page }) => {
      const trigger = page.locator(BASIC_TRIGGER).first()

      await trigger.click()

      const alertDialog = page.locator(`${BASIC_DIALOG}[data-state="open"]`)
      await expect(alertDialog).toBeVisible()
      await expect(alertDialog).toHaveAttribute('aria-modal', 'true')
      await expect(alertDialog).toHaveAttribute('aria-labelledby', 'alert-basic-title')
      await expect(alertDialog).toHaveAttribute('aria-describedby', 'alert-basic-description')
    })

    test('focuses first focusable element when opened', async ({ page }) => {
      const trigger = page.locator(BASIC_TRIGGER).first()

      await trigger.click()

      const alertDialog = page.locator(`${BASIC_DIALOG}[data-state="open"]`)
      await expect(alertDialog).toBeVisible()

      // First focusable element (Cancel button) should be focused
      const cancelButton = alertDialog.locator('button:has-text("Cancel")')
      await expect(cancelButton).toBeFocused()
    })

    test('traps focus within alert dialog', async ({ page }) => {
      const trigger = page.locator(BASIC_TRIGGER).first()

      await trigger.click()

      const alertDialog = page.locator(`${BASIC_DIALOG}[data-state="open"]`)
      await expect(alertDialog).toBeVisible()

      const cancelButton = alertDialog.locator('button:has-text("Cancel")')
      await expect(cancelButton).toBeFocused()

      // Focus on alert dialog container
      await alertDialog.focus()

      // Tab should move focus to the first focusable element
      await page.keyboard.press('Tab')
      await expect(cancelButton).toBeFocused()
    })
  })

  test.describe('AlertDialog Animations', () => {
    test('open animation plays', async ({ page }) => {
      const trigger = page.locator(BASIC_TRIGGER).first()

      const closedDialog = page.locator(`${BASIC_DIALOG}[data-state="closed"]`).first()
      await expect(closedDialog).toHaveCSS('opacity', '0')

      await trigger.click()

      const openDialog = page.locator(`${BASIC_DIALOG}[data-state="open"]`)
      await expect(openDialog).toBeVisible()
      await expect(openDialog).toHaveCSS('opacity', '1')

      // Dialog should have scale-100 class applied (fully scaled)
      await expect(openDialog).toHaveClass(/scale-100/)
    })

    test('close via ESC - animation plays', async ({ page }) => {
      const trigger = page.locator(BASIC_TRIGGER).first()

      await trigger.click()

      const openDialog = page.locator(`${BASIC_DIALOG}[data-state="open"]`)
      await expect(openDialog).toBeVisible()

      await page.keyboard.press('Escape')

      const closedDialog = page.locator(`${BASIC_DIALOG}[data-state="closed"]`).first()
      await expect(closedDialog).toHaveCSS('opacity', '0')
    })
  })

  test.describe('Destructive AlertDialog', () => {
    test('opens destructive alert dialog', async ({ page }) => {
      const trigger = page.locator(DESTRUCTIVE_TRIGGER).first()

      await trigger.click()

      const alertDialog = page.locator(DESTRUCTIVE_DIALOG)
      await expect(alertDialog).toBeVisible()
      await expect(alertDialog.locator('text=Delete Account').first()).toBeVisible()
    })

    test('has destructive styling on trigger button', async ({ page }) => {
      const trigger = page.locator(DESTRUCTIVE_TRIGGER).first()

      await expect(trigger).toBeVisible()
      await expect(trigger).toHaveClass(/bg-destructive/)
    })

    test('closes destructive dialog when Cancel is clicked', async ({ page }) => {
      const trigger = page.locator(DESTRUCTIVE_TRIGGER).first()

      await trigger.click()

      const alertDialog = page.locator(DESTRUCTIVE_DIALOG)
      await expect(alertDialog).toBeVisible()

      const cancelButton = alertDialog.locator('button:has-text("Cancel")')
      await cancelButton.click()

      await expect(alertDialog).toHaveCSS('opacity', '0')
    })

    test('closes destructive dialog when Delete action is clicked', async ({ page }) => {
      const trigger = page.locator(DESTRUCTIVE_TRIGGER).first()

      await trigger.click()

      const alertDialog = page.locator(DESTRUCTIVE_DIALOG)
      await expect(alertDialog).toBeVisible()

      const deleteButton = alertDialog.locator('button:has-text("Delete")')
      await deleteButton.click()

      await expect(alertDialog).toHaveCSS('opacity', '0')
    })

    test('does NOT close destructive dialog when overlay is clicked', async ({ page }) => {
      const trigger = page.locator(DESTRUCTIVE_TRIGGER).first()

      await trigger.click()

      const alertDialog = page.locator(DESTRUCTIVE_DIALOG)
      await expect(alertDialog).toBeVisible()

      // Click the overlay
      const overlay = page.locator('[data-slot="alert-dialog-overlay"][data-state="open"]').first()
      await overlay.click({ position: OVERLAY_CLICK_POSITION })

      // Alert dialog should STILL be open
      await expect(alertDialog).toBeVisible()
      await expect(alertDialog).toHaveCSS('opacity', '1')
    })
  })

})

test.describe('AlertDialogTrigger asChild', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/alert-dialog')
  })

  test('custom button renders as trigger with destructive styling', async ({ page }) => {
    const trigger = page.locator(DESTRUCTIVE_TRIGGER).first()

    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveClass(/bg-destructive/)
  })

  test('display:contents wrapper is present on asChild trigger', async ({ page }) => {
    const triggerWrapper = page.locator('[data-slot="alert-dialog-trigger"]').last()

    await expect(triggerWrapper).toBeVisible()
    await expect(triggerWrapper).toHaveCSS('display', 'contents')
  })

  test('clicking asChild trigger opens alert dialog', async ({ page }) => {
    const trigger = page.locator(DESTRUCTIVE_TRIGGER).first()

    await trigger.click()

    const alertDialog = page.locator(DESTRUCTIVE_DIALOG)
    await expect(alertDialog).toBeVisible()
  })

  test('alert dialog can be closed and reopened via asChild trigger', async ({ page }) => {
    const trigger = page.locator(DESTRUCTIVE_TRIGGER).first()

    // Open
    await trigger.click()
    const alertDialog = page.locator(DESTRUCTIVE_DIALOG)
    await expect(alertDialog).toBeVisible()

    // Close via Cancel
    const cancelButton = alertDialog.locator('button:has-text("Cancel")')
    await cancelButton.click()
    await expect(alertDialog).toHaveCSS('opacity', '0')

    // Reopen
    await trigger.click()
    await expect(alertDialog).toBeVisible()
    await expect(alertDialog).toHaveCSS('opacity', '1')
  })
})
