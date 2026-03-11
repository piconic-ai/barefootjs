import { test, expect } from '@playwright/test'

/**
 * E2E tests to verify the reactivity model documented in spec/compiler.md
 *
 * These tests verify that:
 * 1. Signal getter calls are reactive
 * 2. Props in JSX are reactive (via createEffect)
 * 3. Props in memo/effect are reactive (auto-transformed to props.xxx)
 * 4. Child component props with getters are reactive
 */

test.describe('Reactivity Patterns', () => {
  test.describe('Signal Reactivity', () => {
    test('signal getter in JSX updates when signal changes', async ({ page }) => {
      await page.goto('/components/checkbox#form')

      // Find the Form section with multiple checkboxes
      const section = page.locator('[bf-s^="CheckboxFormDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('[data-slot="checkbox"]')
      const selectedText = section.locator('text=/Selected:/')

      // Initial state - Desktop is checked by default
      await expect(selectedText).toContainText('Desktop')

      // Click Mobile checkbox
      const mobileCheckbox = checkboxes.first()
      await mobileCheckbox.click()

      // Verify selection updated
      await expect(selectedText).toContainText('Mobile')
      await expect(selectedText).toContainText('Desktop')
    })
  })

  test.describe('Props Reactivity (Parent → Child)', () => {
    test('child component updates when parent signal changes via getter', async ({ page }) => {
      await page.goto('/components/checkbox#form')

      // The CheckboxFormDemo passes `checked={desktop()}` to Checkbox
      // This tests that parent signal changes flow to child via getter
      const section = page.locator('[bf-s^="CheckboxFormDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('[data-slot="checkbox"]')

      // Desktop checkbox (second one) should be checked initially
      const desktopCheckbox = checkboxes.nth(1)
      await expect(desktopCheckbox).toHaveAttribute('aria-checked', 'true')

      // Click to toggle off
      await desktopCheckbox.click()
      await expect(desktopCheckbox).toHaveAttribute('aria-checked', 'false')

      // Verify the selected text updated (props reactivity working)
      const selectedText = section.locator('text=/Selected:/')
      await expect(selectedText).not.toContainText('Desktop')
    })
  })

  test.describe('Memo Reactivity', () => {
    test('memo updates when dependency signal changes', async ({ page }) => {
      // The checkbox component uses:
      // const isControlled = createMemo(() => props.checked !== undefined)
      // const isChecked = createMemo(() => isControlled() ? controlledChecked() : internalChecked())

      await page.goto('/components/checkbox')

      // Use the terms demo at the top (CheckboxTermsDemo)
      const section = page.locator('[bf-s^="CheckboxTermsDemo_"]:not([data-slot])').first()
      const checkbox = section.locator('[data-slot="checkbox"]')

      // This checkbox is controlled (checked prop is passed)
      // The isControlled memo should return true
      // The isChecked memo should track controlledChecked

      // Click to verify memo chain updates correctly
      await checkbox.click()
      await expect(checkbox).toHaveAttribute('data-state', 'checked')

      await checkbox.click()
      await expect(checkbox).toHaveAttribute('data-state', 'unchecked')
    })
  })

  test.describe('Uncontrolled Mode (Internal State)', () => {
    test('uncontrolled checkbox uses internal signal', async ({ page }) => {
      await page.goto('/components/checkbox#basic')

      // The basic checkbox section has uncontrolled checkboxes
      const section = page.locator('[bf-s^="CheckboxBasicDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('[data-slot="checkbox"]')

      // Third checkbox is disabled - verify it renders in unchecked state
      await expect(checkboxes.nth(2)).toHaveAttribute('aria-checked', 'false')
      await expect(checkboxes.nth(2)).toBeDisabled()
    })
  })

  test.describe('JSX Expression Reactivity', () => {
    test('conditional JSX updates based on signal', async ({ page }) => {
      await page.goto('/components/checkbox#form')

      const section = page.locator('[bf-s^="CheckboxFormDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('[data-slot="checkbox"]')
      const selectedText = section.locator('text=/Selected:/')

      // Initial: Desktop is selected
      await expect(selectedText).toContainText('Desktop')

      // Click Email checkbox (third one)
      const emailCheckbox = checkboxes.nth(2)
      await emailCheckbox.click()

      // Verify both Desktop and Email are now shown
      await expect(selectedText).toContainText('Desktop')
      await expect(selectedText).toContainText('Email')
    })
  })

  test.describe('Attribute Reactivity', () => {
    test('aria-checked attribute updates reactively', async ({ page }) => {
      await page.goto('/components/checkbox')

      // Get first checkbox (terms demo)
      const section = page.locator('[bf-s^="CheckboxTermsDemo_"]:not([data-slot])').first()
      const checkbox = section.locator('[data-slot="checkbox"]')

      const initialState = await checkbox.getAttribute('aria-checked')
      expect(initialState).toBe('false')

      // Click to toggle
      await checkbox.click()

      const newState = await checkbox.getAttribute('aria-checked')
      expect(newState).toBe('true')
    })

    test('data-state attribute updates reactively', async ({ page }) => {
      await page.goto('/components/checkbox')

      const section = page.locator('[bf-s^="CheckboxTermsDemo_"]:not([data-slot])').first()
      const checkbox = section.locator('[data-slot="checkbox"]')

      await expect(checkbox).toHaveAttribute('data-state', 'unchecked')

      await checkbox.click()

      await expect(checkbox).toHaveAttribute('data-state', 'checked')
    })
  })

  test.describe('Button State Binding', () => {
    test('button disabled state updates based on checkbox', async ({ page }) => {
      await page.goto('/components/checkbox')

      const section = page.locator('[bf-s^="CheckboxTermsDemo_"]:not([data-slot])').first()
      const checkbox = section.locator('[data-slot="checkbox"]')
      const button = section.locator('button:has-text("Continue")')

      // Button should be disabled initially
      await expect(button).toBeDisabled()

      // Check the checkbox
      await checkbox.click()

      // Button should now be enabled
      await expect(button).toBeEnabled()

      // Uncheck
      await checkbox.click()

      // Button should be disabled again
      await expect(button).toBeDisabled()
    })
  })

  test.describe('Email List Selection', () => {
    test('email list checkboxes work independently', async ({ page }) => {
      await page.goto('/components/checkbox#email-list')

      const section = page.locator('[bf-s^="CheckboxEmailListDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('[data-slot="checkbox"]')

      // Initially shows "Select all"
      await expect(section.locator('text=Select all')).toBeVisible()

      // Click first email checkbox (not the select all)
      const firstEmailCheckbox = checkboxes.nth(1)
      await firstEmailCheckbox.click()

      // Should show "1 selected"
      await expect(section.locator('text=1 selected')).toBeVisible()
    })
  })
})
