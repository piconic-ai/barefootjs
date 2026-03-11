import { test, expect } from '@playwright/test'

test.describe('Checkbox Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/checkbox')
  })

  test.describe('Preview (Terms Demo)', () => {
    test('button is disabled when unchecked', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxTermsDemo_"]:not([data-slot])').first()
      const button = section.locator('button:has-text("Continue")')
      await expect(button).toBeDisabled()
    })

    test('button enables when checkbox is checked', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxTermsDemo_"]:not([data-slot])').first()
      const checkbox = section.locator('button[role="checkbox"]')
      const button = section.locator('button:has-text("Continue")')

      await checkbox.click()
      await expect(button).toBeEnabled()
    })

    test('clicking label shows checkmark SVG in checkbox', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxTermsDemo_"]:not([data-slot])').first()
      const checkbox = section.locator('button[role="checkbox"]')
      const label = section.locator('text=I agree to the terms and conditions')

      // Initially no checkmark
      await expect(checkbox.locator('svg[data-slot="checkbox-indicator"]')).not.toBeVisible()

      // Click the label (which triggers setAccepted via handleLabelClick)
      await label.click()

      // Checkbox should show checkmark SVG
      // First wait for data-state to be checked (confirms state update is complete)
      await expect(checkbox).toHaveAttribute('data-state', 'checked')
      await expect(checkbox).toHaveAttribute('aria-checked', 'true')
      // Then check SVG (use more specific selector)
      await expect(checkbox.locator('svg[data-slot="checkbox-indicator"]')).toBeVisible()
    })
  })

  test.describe('Basic', () => {
    test('clicking toggles checkbox state', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxBasicDemo_"]:not([data-slot])').first()
      const checkbox = section.locator('button[role="checkbox"]').first()

      // Initially unchecked
      await expect(checkbox).toHaveAttribute('aria-checked', 'false')

      // Click to check
      await checkbox.click()
      await expect(checkbox).toHaveAttribute('aria-checked', 'true')

      // Click to uncheck
      await checkbox.click()
      await expect(checkbox).toHaveAttribute('aria-checked', 'false')
    })
  })

  test.describe('Form', () => {
    test('updates selection when checkboxes are toggled', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxFormDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')
      const selectedText = section.locator('text=/Selected:/')

      // Click Mobile (first checkbox)
      await checkboxes.first().click()
      await expect(selectedText).toContainText('Mobile')
      await expect(selectedText).toContainText('Desktop')
    })
  })

  test.describe('Email List', () => {
    test('can select individual emails', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxEmailListDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')

      // First checkbox is "select all", second is first email
      const firstEmailCheckbox = checkboxes.nth(1)
      await firstEmailCheckbox.click()

      // Should show "1 selected"
      await expect(section.locator('text=1 selected')).toBeVisible()
    })

    test('select all shows checkmark SVG in all email checkboxes', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxEmailListDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')

      // Click "Select all" checkbox (first one)
      const selectAllCheckbox = checkboxes.first()
      await selectAllCheckbox.click()

      // Should show "3 selected"
      await expect(section.locator('text=3 selected')).toBeVisible()

      // All 4 checkboxes should have checkmark SVG (select all + 3 emails)
      for (let i = 0; i < 4; i++) {
        const checkbox = checkboxes.nth(i)
        // First wait for data-state to be checked (confirms state update is complete)
        await expect(checkbox).toHaveAttribute('data-state', 'checked')
        // Then check SVG (use more specific selector to avoid stale reference)
        await expect(checkbox.locator('svg[data-slot="checkbox-indicator"]')).toBeVisible()
      }
    })
  })

  test.describe('Email List Detailed Behavior', () => {
    test('selecting 1 email shows "1 selected"', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxEmailListDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')

      await checkboxes.nth(1).click()
      await expect(section.locator('text=1 selected')).toBeVisible()
    })

    test('selecting 2 emails shows "2 selected"', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxEmailListDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')

      await checkboxes.nth(1).click()
      await checkboxes.nth(2).click()
      await expect(section.locator('text=2 selected')).toBeVisible()
    })

    test('selecting all 3 emails shows "3 selected" and checks "Select all"', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxEmailListDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')

      await checkboxes.nth(1).click()
      await checkboxes.nth(2).click()
      await checkboxes.nth(3).click()

      await expect(section.locator('text=3 selected')).toBeVisible()
      await expect(checkboxes.first()).toHaveAttribute('aria-checked', 'true') // Select all
    })

    test('unselecting one email updates count', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxEmailListDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')

      // Select 2
      await checkboxes.nth(1).click()
      await checkboxes.nth(2).click()
      await expect(section.locator('text=2 selected')).toBeVisible()

      // Unselect 1
      await checkboxes.nth(1).click()
      await expect(section.locator('text=1 selected')).toBeVisible()
    })

    test('unselecting all returns to "Select all"', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxEmailListDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')

      // Select 1, then unselect
      await checkboxes.nth(1).click()
      await checkboxes.nth(1).click()

      await expect(section.locator('text=Select all')).toBeVisible()
    })

    test('clicking "Select all" when partially selected selects all', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxEmailListDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')

      // Select 1 email first
      await checkboxes.nth(1).click()
      await expect(section.locator('text=1 selected')).toBeVisible()

      // Click "Select all"
      await checkboxes.first().click()

      // All should be selected
      await expect(section.locator('text=3 selected')).toBeVisible()
      for (let i = 0; i < 4; i++) {
        await expect(checkboxes.nth(i)).toHaveAttribute('aria-checked', 'true')
      }
    })

    test('"Mark as read" appears only when selection > 0', async ({ page }) => {
      const section = page.locator('[bf-s^="CheckboxEmailListDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')

      // Initially hidden
      await expect(section.locator('text=Mark as read')).not.toBeVisible()

      // Select one - visible
      await checkboxes.nth(1).click()
      await expect(section.locator('text=1 selected')).toBeVisible() // Wait for selection update
      await expect(section.locator('text=Mark as read')).toBeVisible()

      // Unselect - hidden again
      await checkboxes.nth(1).click()
      await expect(section.locator('text=Select all')).toBeVisible() // Wait for selection reset
      await expect(section.locator('text=Mark as read')).not.toBeVisible()
    })
  })

})
