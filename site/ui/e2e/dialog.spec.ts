import { test, expect } from '@playwright/test'

// Click position for overlay outside the dialog area.
// The dialog is centered on screen, so clicking near the left edge of the overlay
// ensures we click the overlay itself, not the dialog content on top of it.
const OVERLAY_CLICK_POSITION = { x: 10, y: 10 }

test.describe('Dialog Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/dialog')
  })

  test.describe('Basic Dialog', () => {
    test('opens dialog when trigger is clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DialogBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Create Task")')

      await trigger.click()

      // Dialog is portaled to body, so we search globally by aria-labelledby
      const dialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('text=Create New Task')).toBeVisible()
    })

    test('focuses first form element when dialog opens', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DialogBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Create Task")')

      await trigger.click()

      // Dialog is portaled to body
      const dialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
      await expect(dialog).toBeVisible()

      // First form element (title input) should be focused
      const titleInput = dialog.locator('input#task-title')
      await expect(titleInput).toBeFocused()
    })

    test('closes dialog when close button is clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DialogBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Create Task")')

      await trigger.click()

      // Dialog is portaled to body
      const openDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
      await expect(openDialog).toBeVisible()

      // Click cancel button
      const cancelButton = openDialog.locator('button:has-text("Cancel")')
      await cancelButton.click()

      // Dialog should be closed (data-state changes to "closed")
      const closedDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="closed"]').first()
      await expect(closedDialog).toHaveCSS('opacity', '0')
    })

    test('closes dialog when ESC key is pressed', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DialogBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Create Task")')

      await trigger.click()

      // Dialog is portaled to body
      const openDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
      await expect(openDialog).toBeVisible()

      // Focus on dialog for ESC key to work
      await openDialog.focus()

      // Press ESC to close dialog
      await page.keyboard.press('Escape')

      // Dialog should be closed (data-state changes to "closed")
      const closedDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="closed"]').first()
      await expect(closedDialog).toHaveCSS('opacity', '0')
    })

    test('closes dialog when overlay is clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DialogBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Create Task")')

      await trigger.click()

      // Dialog is portaled to body
      const openDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
      await expect(openDialog).toBeVisible()

      // Overlay is also portaled to body
      const overlay = page.locator('[data-slot="dialog-overlay"]').first()
      await overlay.click({ position: OVERLAY_CLICK_POSITION })

      // Dialog should be closed (data-state changes to "closed")
      const closedDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="closed"]').first()
      await expect(closedDialog).toHaveCSS('opacity', '0')
    })

    test('has correct accessibility attributes', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DialogBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Create Task")')

      await trigger.click()

      // Dialog is portaled to body
      const dialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveAttribute('aria-modal', 'true')
      await expect(dialog).toHaveAttribute('aria-labelledby', 'dialog-title')
      await expect(dialog).toHaveAttribute('aria-describedby', 'dialog-description')
    })

    test('traps focus within dialog', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DialogBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Create Task")')

      await trigger.click()

      // Dialog is portaled to body
      const dialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
      await expect(dialog).toBeVisible()

      // Get focusable elements - first is the title input
      const titleInput = dialog.locator('input#task-title')

      // Wait for autofocus to complete before manually focusing the dialog container
      await expect(titleInput).toBeFocused()

      // Focus on dialog container
      await dialog.focus()

      // Tab should move focus to the first focusable element (title input)
      await page.keyboard.press('Tab')
      await expect(titleInput).toBeFocused()
    })
  })

  test.describe('Dialog Animations', () => {
    test('open animation plays', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DialogBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Create Task")')
      // Dialog is portaled to body - check closed state first
      const closedDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="closed"]').first()

      // Initially dialog should be invisible (opacity-0)
      await expect(closedDialog).toHaveCSS('opacity', '0')

      await trigger.click()

      // Dialog should become visible with animation
      const openDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
      await expect(openDialog).toBeVisible()
      await expect(openDialog).toHaveCSS('opacity', '1')

      // Dialog should have scale-100 class applied (fully scaled)
      await expect(openDialog).toHaveClass(/scale-100/)
    })

    test('close via ESC - animation plays', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DialogBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Create Task")')

      await trigger.click()

      // Dialog is portaled to body
      const openDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
      await expect(openDialog).toBeVisible()

      // Focus on dialog for ESC key to work
      await openDialog.focus()

      // Press ESC to close
      await page.keyboard.press('Escape')

      // Dialog should fade out (opacity becomes 0)
      const closedDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="closed"]').first()
      await expect(closedDialog).toHaveCSS('opacity', '0')
    })

    test('close via overlay click', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DialogBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Create Task")')
      const overlay = page.locator('[data-slot="dialog-overlay"]').first()

      await trigger.click()

      // Dialog is portaled to body
      const openDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
      await expect(openDialog).toBeVisible()

      await overlay.click({ position: OVERLAY_CLICK_POSITION })

      // Dialog should fade out
      const closedDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="closed"]').first()
      await expect(closedDialog).toHaveCSS('opacity', '0')
    })

    test('rapid open/close - no visual glitches', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="DialogBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Create Task")')

      // Rapid open/close sequence
      await trigger.click()
      const openDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="open"]')
      await expect(openDialog).toBeVisible()

      const cancelButton = openDialog.locator('button:has-text("Cancel")')
      await cancelButton.click()
      // Immediately try to open again
      await trigger.click()
      await expect(openDialog).toBeVisible()

      // Final state should be stable
      await expect(openDialog).toHaveCSS('opacity', '1')

      // Close and verify final closed state
      await cancelButton.click()
      const closedDialog = page.locator('[role="dialog"][aria-labelledby="dialog-title"][data-state="closed"]').first()
      await expect(closedDialog).toHaveCSS('opacity', '0')
    })
  })

  test.describe('Delete Confirmation Dialog', () => {
    test('opens delete dialog when trigger is clicked', async ({ page }) => {
      const deleteDemo = page.locator('[bf-s^="DialogFormDemo_"]').first()
      const trigger = deleteDemo.locator('button:has-text("Delete Project")')

      await trigger.click()

      // Dialog is portaled to body
      const dialog = page.locator('[role="dialog"][aria-labelledby="delete-dialog-title"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('text=Delete Project').first()).toBeVisible()
    })

    test('shows confirmation input', async ({ page }) => {
      const deleteDemo = page.locator('[bf-s^="DialogFormDemo_"]').first()
      const trigger = deleteDemo.locator('button:has-text("Delete Project")')

      await trigger.click()

      // Dialog is portaled to body
      const dialog = page.locator('[role="dialog"][aria-labelledby="delete-dialog-title"]')
      await expect(dialog).toBeVisible()

      // Check confirmation prompt
      await expect(dialog.locator('text=Please type')).toBeVisible()
      await expect(dialog.locator('text=my-project').first()).toBeVisible()

      // Delete button should be present
      const deleteButton = dialog.locator('button#delete-project-button')
      await expect(deleteButton).toBeVisible()
    })

    test('delete button is disabled without confirmation', async ({ page }) => {
      const deleteDemo = page.locator('[bf-s^="DialogFormDemo_"]').first()
      const trigger = deleteDemo.locator('button:has-text("Delete Project")')

      await trigger.click()

      // Dialog is portaled to body
      const dialog = page.locator('[role="dialog"][aria-labelledby="delete-dialog-title"]')
      await expect(dialog).toBeVisible()

      // Delete button should be disabled without typing project name
      const deleteButton = dialog.locator('button#delete-project-button')
      await expect(deleteButton).toBeDisabled()

      // Dialog should still be open
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveCSS('opacity', '1')
    })

    test('delete button becomes enabled when project name matches', async ({ page }) => {
      const deleteDemo = page.locator('[bf-s^="DialogFormDemo_"]').first()
      const trigger = deleteDemo.locator('button:has-text("Delete Project")')

      await trigger.click()

      // Dialog is portaled to body
      const dialog = page.locator('[role="dialog"][aria-labelledby="delete-dialog-title"]')
      await expect(dialog).toBeVisible()

      const confirmInput = dialog.locator('input#confirm-project-name')
      const deleteButton = dialog.locator('button#delete-project-button')

      // Initially disabled
      await expect(deleteButton).toBeDisabled()

      // Type correct project name
      await confirmInput.click()
      await confirmInput.pressSequentially('my-project')

      // Button should now be enabled
      await expect(deleteButton).toBeEnabled()
    })

    test('delete closes dialog when project name matches', async ({ page }) => {
      const deleteDemo = page.locator('[bf-s^="DialogFormDemo_"]').first()
      const trigger = deleteDemo.locator('button:has-text("Delete Project")')

      await trigger.click()

      // Dialog is portaled to body
      const dialog = page.locator('[role="dialog"][aria-labelledby="delete-dialog-title"]')
      await expect(dialog).toBeVisible()

      const confirmInput = dialog.locator('input#confirm-project-name')
      const deleteButton = dialog.locator('button#delete-project-button')

      // Type correct project name (using pressSequentially to trigger oninput)
      await confirmInput.click()
      await confirmInput.pressSequentially('my-project')

      // Click delete - should close
      await deleteButton.click()

      // Dialog should be closed
      await expect(dialog).toHaveCSS('opacity', '0')
    })

    test('closes delete dialog when Cancel is clicked', async ({ page }) => {
      const deleteDemo = page.locator('[bf-s^="DialogFormDemo_"]').first()
      const trigger = deleteDemo.locator('button:has-text("Delete Project")')

      await trigger.click()

      // Dialog is portaled to body
      const dialog = page.locator('[role="dialog"][aria-labelledby="delete-dialog-title"]')
      await expect(dialog).toBeVisible()

      const cancelButton = dialog.locator('button:has-text("Cancel")')
      await cancelButton.click()

      // Dialog should be closed (check opacity since we use CSS transitions)
      await expect(dialog).toHaveCSS('opacity', '0')
    })

    test('resets input when dialog is reopened', async ({ page }) => {
      const deleteDemo = page.locator('[bf-s^="DialogFormDemo_"]').first()
      const trigger = deleteDemo.locator('button:has-text("Delete Project")')

      await trigger.click()

      // Dialog is portaled to body
      const dialog = page.locator('[role="dialog"][aria-labelledby="delete-dialog-title"]')
      await expect(dialog).toBeVisible()

      // Type project name and click delete (using pressSequentially to trigger oninput)
      const confirmInput = dialog.locator('input#confirm-project-name')
      await confirmInput.click()
      await confirmInput.pressSequentially('my-project')

      const deleteButton = dialog.locator('button#delete-project-button')
      await deleteButton.click()

      // Dialog should be closed
      await expect(dialog).toHaveCSS('opacity', '0')

      // Re-open and check input is cleared
      await trigger.click()
      await expect(dialog).toBeVisible()
      await expect(confirmInput).toHaveValue('')
    })
  })

})

test.describe('DialogTrigger asChild', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/dialog')
  })

  test('custom button renders as trigger with destructive styling', async ({ page }) => {
    const deleteDemo = page.locator('[bf-s^="DialogFormDemo_"]').first()
    const trigger = deleteDemo.locator('button:has-text("Delete Project")')

    await expect(trigger).toBeVisible()
    // Should be a custom-styled button (destructive), not the default DialogTrigger styling
    await expect(trigger).toHaveClass(/bg-destructive/)
  })

  test('display:contents wrapper is present on asChild trigger', async ({ page }) => {
    const deleteDemo = page.locator('[bf-s^="DialogFormDemo_"]').first()
    const triggerWrapper = deleteDemo.locator('[data-slot="dialog-trigger"]')

    await expect(triggerWrapper).toBeVisible()
    // The wrapper should use display:contents
    await expect(triggerWrapper).toHaveCSS('display', 'contents')
  })

  test('clicking asChild trigger opens dialog', async ({ page }) => {
    const deleteDemo = page.locator('[bf-s^="DialogFormDemo_"]').first()
    const trigger = deleteDemo.locator('button:has-text("Delete Project")')

    await trigger.click()

    const dialog = page.locator('[role="dialog"][aria-labelledby="delete-dialog-title"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('text=Delete Project').first()).toBeVisible()
  })

  test('dialog can be closed and reopened via asChild trigger', async ({ page }) => {
    const deleteDemo = page.locator('[bf-s^="DialogFormDemo_"]').first()
    const trigger = deleteDemo.locator('button:has-text("Delete Project")')

    // Open dialog
    await trigger.click()
    const dialog = page.locator('[role="dialog"][aria-labelledby="delete-dialog-title"]')
    await expect(dialog).toBeVisible()

    // Close via Cancel
    const cancelButton = dialog.locator('button:has-text("Cancel")')
    await cancelButton.click()
    await expect(dialog).toHaveCSS('opacity', '0')

    // Reopen
    await trigger.click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS('opacity', '1')
  })
})
