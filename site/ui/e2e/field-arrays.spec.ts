import { test, expect } from '@playwright/test'

test.describe('Field Arrays Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser error:', msg.text())
      }
    })
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/docs/forms/field-arrays')
  })

  test.describe('Basic Field Array Demo', () => {
    test('displays basic field array demo', async ({ page }) => {
      await expect(page.locator('[bf-s^="BasicFieldArrayDemo_"]')).toBeVisible()
    })

    test('shows one field initially', async ({ page }) => {
      const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
      const inputs = demo.locator('input')
      await expect(inputs).toHaveCount(1)
    })

    test('shows field count', async ({ page }) => {
      const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
      const fieldCount = demo.locator('.field-count')
      await expect(fieldCount).toContainText('1 email(s) added')
    })

    test('adds new field when add button clicked', async ({ page }) => {
      const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
      const addButton = demo.locator('button:has-text("+ Add Email")')
      const inputs = demo.locator('input')

      await expect(inputs).toHaveCount(1)
      await addButton.click()
      await expect(inputs).toHaveCount(2)
      await addButton.click()
      await expect(inputs).toHaveCount(3)
    })

    test('updates field count when adding fields', async ({ page }) => {
      const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
      const addButton = demo.locator('button:has-text("+ Add Email")')
      const fieldCount = demo.locator('.field-count')

      await addButton.click()
      await expect(fieldCount).toContainText('2 email(s) added')
    })

    test('removes field when remove button clicked', async ({ page }) => {
      const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
      const addButton = demo.locator('button:has-text("+ Add Email")')
      const inputs = demo.locator('input')
      const removeButtons = demo.locator('.field-item button')

      // Add a second field
      await addButton.click()
      await expect(inputs).toHaveCount(2)

      // Remove the first field
      await removeButtons.first().click()
      await expect(inputs).toHaveCount(1)
    })

    test('cannot remove last field', async ({ page }) => {
      const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
      const removeButton = demo.locator('.field-item button').first()

      // Only one field, remove button should be disabled
      await expect(removeButton).toBeDisabled()
    })

    test('shows validation error on blur when empty', async ({ page }) => {
      const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
      const input = demo.locator('input').first()
      const error = demo.locator('.field-error').first()

      await input.focus()
      await input.blur()
      await expect(error).toHaveText('Email is required')
    })

    test('shows format error for invalid email', async ({ page }) => {
      const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
      const input = demo.locator('input').first()
      const error = demo.locator('.field-error').first()

      await input.fill('invalid-email')
      await input.blur()
      await expect(error).toHaveText('Invalid email format')
    })

    test('clears error for valid email', async ({ page }) => {
      const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
      const input = demo.locator('input').first()
      const error = demo.locator('.field-error').first()

      await input.fill('invalid')
      await input.blur()
      await expect(error).toHaveText('Invalid email format')

      await input.fill('valid@example.com')
      await expect(error).toHaveText('')
    })

    test('submits successfully with valid data', async ({ page }) => {
      const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
      const input = demo.locator('input').first()
      const submitButton = demo.locator('button:has-text("Submit")')
      const successMessage = demo.locator('.success-message')

      await input.fill('test@example.com')
      await submitButton.click()

      await expect(successMessage).toBeVisible()
      await expect(successMessage).toContainText('Emails submitted successfully')
      await expect(successMessage).toContainText('test@example.com')
    })

    test('shows all errors on submit with invalid data', async ({ page }) => {
      const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
      const addButton = demo.locator('button:has-text("+ Add Email")')
      const submitButton = demo.locator('button:has-text("Submit")')
      const errors = demo.locator('.field-error')

      // Add a second field
      await addButton.click()

      // Submit without filling any
      await submitButton.click()

      // Both fields should show errors
      await expect(errors.first()).toHaveText('Email is required')
      await expect(errors.nth(1)).toHaveText('Email is required')
    })
  })

  test.describe('Duplicate Validation Demo', () => {
    test('displays duplicate validation demo', async ({ page }) => {
      await expect(page.locator('[bf-s^="DuplicateValidationDemo_"]')).toBeVisible()
    })

    test('shows two fields initially', async ({ page }) => {
      const demo = page.locator('[bf-s^="DuplicateValidationDemo_"]')
      const inputs = demo.locator('input')
      await expect(inputs).toHaveCount(2)
    })

    test('shows duplicate error when emails match', async ({ page }) => {
      const demo = page.locator('[bf-s^="DuplicateValidationDemo_"]')
      const inputs = demo.locator('input')
      const errors = demo.locator('.field-error')

      await inputs.first().fill('same@example.com')
      await inputs.first().blur()
      await inputs.nth(1).fill('same@example.com')
      await inputs.nth(1).blur()

      // Second field should show duplicate error
      await expect(errors.nth(1)).toHaveText('Duplicate email')
    })

    test('shows duplicate warning count', async ({ page }) => {
      const demo = page.locator('[bf-s^="DuplicateValidationDemo_"]')
      const inputs = demo.locator('input')
      const duplicateWarning = demo.locator('.duplicate-warning')

      await inputs.first().fill('same@example.com')
      await inputs.first().blur()
      await inputs.nth(1).fill('same@example.com')
      await inputs.nth(1).blur()

      await expect(duplicateWarning).toContainText('1 duplicate email(s) detected')
    })

    test('clears duplicate error when email changed', async ({ page }) => {
      const demo = page.locator('[bf-s^="DuplicateValidationDemo_"]')
      const inputs = demo.locator('input')
      const errors = demo.locator('.field-error')

      // Create duplicate
      await inputs.first().fill('same@example.com')
      await inputs.first().blur()
      await inputs.nth(1).fill('same@example.com')
      await inputs.nth(1).blur()
      await expect(errors.nth(1)).toHaveText('Duplicate email')

      // Change second email
      await inputs.nth(1).fill('different@example.com')
      await expect(errors.nth(1)).toHaveText('')
    })
  })

  test.describe('Min/Max Fields Demo', () => {
    test('displays min/max fields demo', async ({ page }) => {
      await expect(page.locator('[bf-s^="MinMaxFieldsDemo_"]')).toBeVisible()
    })

    test('shows one field initially', async ({ page }) => {
      const demo = page.locator('[bf-s^="MinMaxFieldsDemo_"]')
      const inputs = demo.locator('input')
      await expect(inputs).toHaveCount(1)
    })

    test('shows field count with max', async ({ page }) => {
      const demo = page.locator('[bf-s^="MinMaxFieldsDemo_"]')
      const fieldCount = demo.locator('.field-count')
      await expect(fieldCount).toContainText('1 / 5 emails')
    })

    test('can add up to max fields', async ({ page }) => {
      const demo = page.locator('[bf-s^="MinMaxFieldsDemo_"]')
      const addButton = demo.locator('button:has-text("+ Add Email")')
      const inputs = demo.locator('input')
      const fieldCount = demo.locator('.field-count')

      // Add 4 more fields (total 5)
      for (let i = 0; i < 4; i++) {
        await addButton.click()
      }
      await expect(inputs).toHaveCount(5)
      await expect(fieldCount).toContainText('5 / 5 emails')
    })

    test('add button disabled at max', async ({ page }) => {
      const demo = page.locator('[bf-s^="MinMaxFieldsDemo_"]')
      const addButton = demo.locator('button:has-text("+ Add Email")')
      const maxWarning = demo.locator('.max-warning')

      // Add 4 more fields (total 5)
      for (let i = 0; i < 4; i++) {
        await addButton.click()
      }

      await expect(addButton).toBeDisabled()
      await expect(maxWarning).toContainText('Maximum 5 emails allowed')
    })

    test('remove button disabled at min', async ({ page }) => {
      const demo = page.locator('[bf-s^="MinMaxFieldsDemo_"]')
      const removeButton = demo.locator('.field-item button').first()

      // Only one field, remove button should be disabled
      await expect(removeButton).toBeDisabled()
    })

    test('can remove fields when above min', async ({ page }) => {
      const demo = page.locator('[bf-s^="MinMaxFieldsDemo_"]')
      const addButton = demo.locator('button:has-text("+ Add Email")')
      const removeButtons = demo.locator('.field-item button')
      const inputs = demo.locator('input')

      // Add a second field
      await addButton.click()
      await expect(inputs).toHaveCount(2)

      // Remove buttons should now be enabled
      await expect(removeButtons.first()).not.toBeDisabled()

      // Remove one field
      await removeButtons.first().click()
      await expect(inputs).toHaveCount(1)
    })
  })
})
