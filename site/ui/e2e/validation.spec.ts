import { test, expect } from '@playwright/test'

test.describe('Form Validation Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/forms/validation')
  })

  test.describe('Required Field Demo', () => {
    test('displays required field demo', async ({ page }) => {
      await expect(page.locator('[bf-s^="RequiredFieldDemo_"]')).toBeVisible()
    })

    test('shows no error initially', async ({ page }) => {
      const demo = page.locator('[bf-s^="RequiredFieldDemo_"]')
      const error = demo.locator('.error-message')
      await expect(error).toHaveText('')
    })

    test('shows error on blur when empty', async ({ page }) => {
      const demo = page.locator('[bf-s^="RequiredFieldDemo_"]')
      const input = demo.locator('input')
      const error = demo.locator('.error-message')

      await input.focus()
      await input.blur()
      await expect(error).toHaveText('Name is required')
    })

    test('clears error when value is entered', async ({ page }) => {
      const demo = page.locator('[bf-s^="RequiredFieldDemo_"]')
      const input = demo.locator('input')
      const error = demo.locator('.error-message')

      // Trigger error first
      await input.focus()
      await input.blur()
      await expect(error).toHaveText('Name is required')

      // Enter value to clear error
      await input.fill('John')
      await expect(error).toHaveText('')
    })
  })

  test.describe('Email Validation Demo', () => {
    test('displays email validation demo', async ({ page }) => {
      await expect(page.locator('[bf-s^="EmailValidationDemo_"]')).toBeVisible()
    })

    test('shows required error when empty on blur', async ({ page }) => {
      const demo = page.locator('[bf-s^="EmailValidationDemo_"]')
      const input = demo.locator('input')
      const error = demo.locator('.error-message')

      await input.focus()
      await input.blur()
      await expect(error).toHaveText('Email is required')
    })

    test('shows format error for invalid email', async ({ page }) => {
      const demo = page.locator('[bf-s^="EmailValidationDemo_"]')
      const input = demo.locator('input')
      const error = demo.locator('.error-message')

      await input.fill('invalid-email')
      await input.blur()
      await expect(error).toHaveText('Invalid email format')
    })

    test('shows valid indicator for correct email', async ({ page }) => {
      const demo = page.locator('[bf-s^="EmailValidationDemo_"]')
      const input = demo.locator('input')
      const error = demo.locator('.error-message')
      const valid = demo.locator('.valid-indicator')

      await input.fill('test@example.com')
      await input.blur()
      await expect(error).toHaveText('')
      await expect(valid).toHaveText('Valid')
    })
  })

  test.describe('Password Confirmation Demo', () => {
    test('displays password confirmation demo', async ({ page }) => {
      await expect(page.locator('[bf-s^="PasswordConfirmationDemo_"]')).toBeVisible()
    })

    test('shows password length error', async ({ page }) => {
      const demo = page.locator('[bf-s^="PasswordConfirmationDemo_"]')
      const passwordInput = demo.locator('input[type="password"]').first()
      const error = demo.locator('.password-error')

      await passwordInput.fill('short')
      await passwordInput.blur()
      await expect(error).toHaveText('Password must be at least 8 characters')
    })

    test('shows mismatch error when passwords differ', async ({ page }) => {
      const demo = page.locator('[bf-s^="PasswordConfirmationDemo_"]')
      const passwordInput = demo.locator('input[type="password"]').first()
      const confirmInput = demo.locator('input[type="password"]').last()
      const confirmError = demo.locator('.confirm-error')

      await passwordInput.fill('password123')
      await confirmInput.fill('different123')
      await confirmInput.blur()
      await expect(confirmError).toHaveText('Passwords do not match')
    })

    test('shows match indicator when passwords match', async ({ page }) => {
      const demo = page.locator('[bf-s^="PasswordConfirmationDemo_"]')
      const passwordInput = demo.locator('input[type="password"]').first()
      const confirmInput = demo.locator('input[type="password"]').last()
      const matchIndicator = demo.locator('.match-indicator')

      await passwordInput.fill('password123')
      await passwordInput.blur()
      await confirmInput.fill('password123')
      await confirmInput.blur()
      await expect(matchIndicator).toHaveText('Passwords match!')
    })
  })

  test.describe('Multi-Field Form Demo', () => {
    test('displays multi-field form demo', async ({ page }) => {
      await expect(page.locator('[bf-s^="MultiFieldFormDemo_"]')).toBeVisible()
    })

    test('shows all field errors on submit with empty form', async ({ page }) => {
      // Use direct CSS selectors since nested locators may have issues with bf-s on children
      const demo = page.locator('[bf-s^="MultiFieldFormDemo_"]')
      await expect(demo).toBeVisible()

      const submitButton = page.locator('[bf-s^="MultiFieldFormDemo_"] button')
      const nameError = page.locator('[bf-s^="MultiFieldFormDemo_"] .name-error')
      const emailError = page.locator('[bf-s^="MultiFieldFormDemo_"] .email-error')
      const passwordError = page.locator('[bf-s^="MultiFieldFormDemo_"] .password-error')
      const confirmError = page.locator('[bf-s^="MultiFieldFormDemo_"] .confirm-error')
      const formError = page.locator('[bf-s^="MultiFieldFormDemo_"] .form-error')

      await submitButton.click()

      await expect(nameError).toHaveText('Name is required')
      await expect(emailError).toHaveText('Email is required')
      await expect(passwordError).toHaveText('Password is required')
      await expect(confirmError).toHaveText('Please confirm your password')
      await expect(formError).toHaveText('Please fix the errors above')
    })

    test('shows name length error for short name', async ({ page }) => {
      const demo = page.locator('[bf-s^="MultiFieldFormDemo_"]')
      await expect(demo).toBeVisible()

      const nameInput = page.locator('[bf-s^="MultiFieldFormDemo_"] input').first()
      const nameError = page.locator('[bf-s^="MultiFieldFormDemo_"] .name-error')

      await nameInput.fill('A')
      await nameInput.blur()
      await expect(nameError).toHaveText('Name must be at least 2 characters')
    })

    test('submits successfully with valid data', async ({ page }) => {
      const demo = page.locator('[bf-s^="MultiFieldFormDemo_"]')
      await expect(demo).toBeVisible()

      const inputs = page.locator('[bf-s^="MultiFieldFormDemo_"] input')
      const nameInput = inputs.nth(0)
      const emailInput = inputs.nth(1)
      const passwordInput = inputs.nth(2)
      const confirmInput = inputs.nth(3)
      const submitButton = page.locator('[bf-s^="MultiFieldFormDemo_"] button')
      const successMessage = page.locator('[bf-s^="MultiFieldFormDemo_"] .success-message')

      await nameInput.fill('John Doe')
      await emailInput.fill('john@example.com')
      await passwordInput.fill('password123')
      await confirmInput.fill('password123')
      await submitButton.click()

      await expect(successMessage).toBeVisible()
      await expect(successMessage).toContainText('Form submitted successfully')
      await expect(successMessage).toContainText('John Doe')
      await expect(successMessage).toContainText('john@example.com')
    })

    test('clears errors when valid values are entered', async ({ page }) => {
      const demo = page.locator('[bf-s^="MultiFieldFormDemo_"]')
      await expect(demo).toBeVisible()

      const inputs = page.locator('[bf-s^="MultiFieldFormDemo_"] input')
      const nameInput = inputs.nth(0)
      const emailInput = inputs.nth(1)
      const nameError = page.locator('[bf-s^="MultiFieldFormDemo_"] .name-error')
      const emailError = page.locator('[bf-s^="MultiFieldFormDemo_"] .email-error')
      const submitButton = page.locator('[bf-s^="MultiFieldFormDemo_"] button')

      // Trigger errors
      await submitButton.click()
      await expect(nameError).toHaveText('Name is required')
      await expect(emailError).toHaveText('Email is required')

      // Fix errors
      await nameInput.fill('John')
      await emailInput.fill('john@example.com')
      await expect(nameError).toHaveText('')
      await expect(emailError).toHaveText('')
    })
  })

  test.describe('Async Availability Demo', () => {
    const scope = '[bf-s^="AsyncFieldValidationDemo_"]:not([data-slot])'

    test('renders inline `--err` CSS variable on initial paint', async ({ page }) => {
      const demo = page.locator(scope)
      const msg = demo.locator('[data-async-msg]')
      // SSR should emit the neutral hue (210) so the post-hydration paint
      // matches the server-rendered colour. This locks the
      // `createMemo`-driven SSR substitution path so the inline style
      // attribute is never empty.
      await expect(msg).toHaveAttribute('style', /--err\s*:\s*210/)
    })

    test('Spinner, aria-busy and disabled flip together on async check', async ({ page }) => {
      const demo = page.locator(scope)
      const input = demo.locator('[data-async-input]')
      const spinner = demo.locator('[data-async-spinner]')
      const submit = demo.locator('[data-async-submit]')

      // Pre-validation: no spinner, no busy state, submit enabled.
      await expect(spinner).toHaveCount(0)
      await expect(input).toHaveAttribute('aria-busy', 'false')
      await expect(submit).toBeEnabled()

      await input.fill('newuser')

      // During the in-flight check all three signals fire together.
      await expect(spinner).toBeVisible()
      await expect(input).toHaveAttribute('aria-busy', 'true')
      await expect(submit).toBeDisabled()

      // After it resolves: success state, all three return to idle.
      await expect(spinner).toHaveCount(0, { timeout: 2000 })
      await expect(input).toHaveAttribute('aria-busy', 'false')
      await expect(submit).toBeEnabled()
    })

    test('CSS `--err` hue tracks the validation outcome', async ({ page }) => {
      const demo = page.locator(scope)
      const input = demo.locator('[data-async-input]')
      const msg = demo.locator('[data-async-msg]')

      // Available username → success hue (140 → green)
      await input.fill('newuser')
      await expect(msg).toHaveAttribute('data-async-level', '1', { timeout: 2000 })
      await expect(msg).toHaveAttribute('style', /--err\s*:\s*140/)

      // Reserved username → error hue (0 → red) and submit stays disabled
      await input.fill('admin')
      await expect(msg).toHaveAttribute('data-async-level', '3', { timeout: 2000 })
      await expect(msg).toHaveAttribute('style', /--err\s*:\s*0(?:[^\d]|$)/)
      await expect(demo.locator('[data-async-submit]')).toBeDisabled()
    })
  })
})
