import { test, expect } from '@playwright/test'

test.describe('Progress Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/progress')
  })

  test.describe('Progress Rendering', () => {
    test('displays progress bar elements', async ({ page }) => {
      const progressBars = page.locator('[role="progressbar"]')
      await expect(progressBars.first()).toBeVisible()
    })

    test('has multiple progress examples', async ({ page }) => {
      const progressBars = page.locator('[role="progressbar"]')
      expect(await progressBars.count()).toBeGreaterThan(3)
    })
  })

  test.describe('Simulated Upload', () => {
    test('displays preview with progress bar and text', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressPreviewDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
      await expect(section.locator('[role="progressbar"]')).toBeVisible()
    })

    test('progress bar has correct ARIA attributes', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressPreviewDemo_"]:not([data-slot])').first()
      const progressBar = section.locator('[role="progressbar"]')

      await expect(progressBar).toHaveAttribute('aria-valuemin', '0')
      await expect(progressBar).toHaveAttribute('aria-valuemax', '100')
    })

    test('eventually reaches complete state', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressPreviewDemo_"]:not([data-slot])').first()
      const progressBar = section.locator('[role="progressbar"]')

      // Wait for progress to reach 100 (auto-incrementing by 2 every 100ms)
      await expect(progressBar).toHaveAttribute('data-state', 'complete', { timeout: 10000 })
      await expect(section.locator('text=Upload complete')).toBeVisible()
    })
  })

  test.describe('Basic', () => {
    test('displays basic example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Basic")')).toBeVisible()
      const section = page.locator('[bf-s^="ProgressBasicDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('has three progress bars', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressBasicDemo_"]:not([data-slot])').first()
      const progressBars = section.locator('[role="progressbar"]')
      await expect(progressBars).toHaveCount(3)
    })

    test('first progress bar has value 0 with loading state', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressBasicDemo_"]:not([data-slot])').first()
      const progressBars = section.locator('[role="progressbar"]')
      await expect(progressBars.first()).toHaveAttribute('aria-valuenow', '0')
      await expect(progressBars.first()).toHaveAttribute('data-state', 'loading')
    })

    test('second progress bar has value 50', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressBasicDemo_"]:not([data-slot])').first()
      const progressBars = section.locator('[role="progressbar"]')
      await expect(progressBars.nth(1)).toHaveAttribute('aria-valuenow', '50')
      await expect(progressBars.nth(1)).toHaveAttribute('data-state', 'loading')
    })

    test('third progress bar has value 100 with complete state', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressBasicDemo_"]:not([data-slot])').first()
      const progressBars = section.locator('[role="progressbar"]')
      await expect(progressBars.nth(2)).toHaveAttribute('aria-valuenow', '100')
      await expect(progressBars.nth(2)).toHaveAttribute('data-state', 'complete')
    })
  })

  test.describe('Form Wizard', () => {
    test('displays form wizard example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Form Wizard")')).toBeVisible()
      const section = page.locator('[bf-s^="ProgressFormDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('shows setup wizard heading', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressFormDemo_"]:not([data-slot])').first()
      await expect(section.locator('h4:has-text("Setup Wizard")')).toBeVisible()
    })

    test('starts at step 1 with progress at 0%', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressFormDemo_"]:not([data-slot])').first()
      const progressBar = section.locator('[role="progressbar"]')
      await expect(progressBar).toHaveAttribute('aria-valuenow', '0')
      await expect(progressBar).toHaveAttribute('data-state', 'loading')
      await expect(section.locator('text=0%')).toBeVisible()
    })

    test('back button is disabled at step 1', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressFormDemo_"]:not([data-slot])').first()
      const backButton = section.locator('button:has-text("Back")')
      await expect(backButton).toBeDisabled()
    })

    test('clicking Next advances step and progress', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressFormDemo_"]:not([data-slot])').first()
      const nextButton = section.locator('button:has-text("Next")')
      const progressBar = section.locator('[role="progressbar"]')

      await nextButton.click()
      await expect(progressBar).toHaveAttribute('aria-valuenow', '33')
      await expect(section.locator('text=Step 2')).toBeVisible()
    })

    test('at final step progress is complete and Next is disabled', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressFormDemo_"]:not([data-slot])').first()
      const nextButton = section.locator('button:has-text("Next")')
      const progressBar = section.locator('[role="progressbar"]')

      // Advance to final step
      await nextButton.click()
      await nextButton.click()
      await nextButton.click()

      await expect(progressBar).toHaveAttribute('aria-valuenow', '100')
      await expect(progressBar).toHaveAttribute('data-state', 'complete')
      await expect(nextButton).toBeDisabled()
    })

    test('Back navigates backward', async ({ page }) => {
      const section = page.locator('[bf-s^="ProgressFormDemo_"]:not([data-slot])').first()
      const nextButton = section.locator('button:has-text("Next")')
      const backButton = section.locator('button:has-text("Back")')
      const progressBar = section.locator('[role="progressbar"]')

      // Advance to step 2
      await nextButton.click()
      await expect(section.locator('text=Step 2')).toBeVisible()

      // Go back to step 1
      await backButton.click()
      await expect(section.locator('text=Step 1')).toBeVisible()
      await expect(progressBar).toHaveAttribute('aria-valuenow', '0')
    })
  })
})
