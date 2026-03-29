import { test, expect } from '@playwright/test'

test.describe('Multi-Step Form Block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/multi-step-form')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="MultiStepFormDemo_"]:not([data-slot])').first()

  test.describe('Initial Rendering', () => {
    test('shows step 1 by default', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.step-badge')).toContainText('Step 1 of 4')
      await expect(s.locator('.step-1')).toBeVisible()
    })

    test('shows step indicator with 4 steps', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.step-item')).toHaveCount(4)
    })

    test('next button shows "Next" text', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('button:has-text("Next")')).toBeVisible()
    })
  })

  test.describe('Step 1: Account', () => {
    test('shows validation errors for invalid email', async ({ page }) => {
      const s = section(page)
      await s.locator('input[placeholder="you@example.com"]').fill('invalid')
      await expect(s.locator('.email-error')).toBeVisible()
    })

    test('shows password length error', async ({ page }) => {
      const s = section(page)
      await s.locator('input[placeholder*="8 characters"]').fill('short')
      await expect(s.locator('.password-error')).toContainText('8 characters')
    })

    test('shows confirm password mismatch error', async ({ page }) => {
      const s = section(page)
      await s.locator('input[placeholder*="8 characters"]').fill('password123')
      await s.locator('input[placeholder*="Repeat"]').fill('different')
      await expect(s.locator('.confirm-error')).toContainText('do not match')
    })
  })

  test.describe('Step Navigation', () => {
    async function fillStep1(page: any) {
      const s = section(page)
      await s.locator('input[placeholder="you@example.com"]').fill('test@example.com')
      await s.locator('input[placeholder*="8 characters"]').fill('password123')
      await s.locator('input[placeholder*="Repeat"]').fill('password123')
    }

    test('navigating to step 2 shows profile fields', async ({ page }) => {
      await fillStep1(page)
      const s = section(page)
      await s.locator('button:has-text("Next")').click()

      await expect(s.locator('.step-2')).toBeVisible()
      await expect(s.locator('.step-badge')).toContainText('Step 2 of 4')
    })

    test('back button returns to previous step', async ({ page }) => {
      await fillStep1(page)
      const s = section(page)
      await s.locator('button:has-text("Next")').click()
      await expect(s.locator('.step-2')).toBeVisible()

      await s.locator('button:has-text("Back")').click()
      await expect(s.locator('.step-1')).toBeVisible()
    })

    test('step 1 values are preserved after going back', async ({ page }) => {
      await fillStep1(page)
      const s = section(page)
      await s.locator('button:has-text("Next")').click()
      await s.locator('button:has-text("Back")').click()

      await expect(s.locator('input[placeholder="you@example.com"]')).toHaveValue('test@example.com')
    })

    test('clicking step indicator navigates to that step', async ({ page }) => {
      await fillStep1(page)
      const s = section(page)
      await s.locator('button:has-text("Next")').click()

      // Click step 1 indicator to go back
      await s.locator('.step-item').first().click()
      await expect(s.locator('.step-1')).toBeVisible()
    })
  })

  test.describe('Step Indicator', () => {
    test('step 2 indicator is highlighted when on step 2', async ({ page }) => {
      const s = section(page)
      await s.locator('input[placeholder="you@example.com"]').fill('test@example.com')
      await s.locator('input[placeholder*="8 characters"]').fill('password123')
      await s.locator('input[placeholder*="Repeat"]').fill('password123')
      await s.locator('button:has-text("Next")').click()

      // Step 2 indicator should have primary border (active step)
      const step2 = s.locator('.step-item').nth(1)
      await expect(step2).toHaveClass(/border-primary/)
    })
  })

  test.describe('Full Flow', () => {
    test('complete wizard from step 1 to submission', async ({ page }) => {
      const s = section(page)

      // Step 1: Account
      await s.locator('input[placeholder="you@example.com"]').fill('user@example.com')
      await s.locator('input[placeholder*="8 characters"]').fill('securepass1')
      await s.locator('input[placeholder*="Repeat"]').fill('securepass1')
      await s.locator('button:has-text("Next")').click()

      // Step 2: Profile
      await expect(s.locator('.step-2')).toBeVisible()
      await s.locator('input[placeholder="John Doe"]').fill('Jane Smith')
      await s.locator('input[placeholder="johndoe"]').fill('janesmith')
      await s.locator('button:has-text("Next")').click()

      // Step 3: Preferences
      await expect(s.locator('.step-3')).toBeVisible()
      await s.locator('button:has-text("Next")').click()

      // Step 4: Review
      await expect(s.locator('.step-4')).toBeVisible()
      await expect(s.locator('.review-email')).toHaveText('user@example.com')
      await expect(s.locator('.review-name')).toHaveText('Jane Smith')
      await expect(s.locator('.review-username')).toHaveText('@janesmith')
      await expect(s.locator('.review-plan')).toHaveText('free')

      // Submit — button text changes to "Create Account" on step 4
      await s.locator('button:has-text("Create Account")').click()

      // Should reset to step 1
      await expect(s.locator('.step-badge')).toContainText('Step 1 of 4')
    })
  })
})
