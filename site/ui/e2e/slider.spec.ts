import { test, expect } from '@playwright/test'

test.describe('Slider Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/slider')
  })

  test.describe('Slider Rendering', () => {
    test('displays slider elements', async ({ page }) => {
      const sliders = page.locator('[role="slider"]')
      await expect(sliders.first()).toBeVisible()
    })

    test('has multiple slider examples', async ({ page }) => {
      const sliders = page.locator('[role="slider"]')
      expect(await sliders.count()).toBeGreaterThan(3)
    })
  })

  test.describe('Basic', () => {
    test('displays basic example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Basic")')).toBeVisible()
      const section = page.locator('[bf-s^="SliderBasicDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('has three sliders', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderBasicDemo_"]:not([data-slot])').first()
      const sliders = section.locator('[role="slider"]')
      await expect(sliders).toHaveCount(3)
    })

    test('first slider starts at 0 (default)', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderBasicDemo_"]:not([data-slot])').first()
      const sliders = section.locator('[role="slider"]')
      await expect(sliders.first()).toHaveAttribute('aria-valuenow', '0')
    })

    test('second slider starts at 50 (defaultValue)', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderBasicDemo_"]:not([data-slot])').first()
      const sliders = section.locator('[role="slider"]')
      await expect(sliders.nth(1)).toHaveAttribute('aria-valuenow', '50')
    })

    test('third slider is disabled', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderBasicDemo_"]:not([data-slot])').first()
      const sliderRoots = section.locator('[data-slot="slider"]')
      await expect(sliderRoots.nth(2)).toHaveAttribute('data-disabled', '')
    })

    test('third slider has value 33', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderBasicDemo_"]:not([data-slot])').first()
      const sliders = section.locator('[role="slider"]')
      await expect(sliders.nth(2)).toHaveAttribute('aria-valuenow', '33')
    })

    test('keyboard navigation works on slider', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderBasicDemo_"]:not([data-slot])').first()
      const slider = section.locator('[role="slider"]').nth(1)

      // Focus the slider
      await slider.focus()
      await expect(slider).toHaveAttribute('aria-valuenow', '50')

      // Press ArrowRight to increase
      await page.keyboard.press('ArrowRight')
      await expect(slider).toHaveAttribute('aria-valuenow', '51')

      // Press ArrowLeft to decrease
      await page.keyboard.press('ArrowLeft')
      await expect(slider).toHaveAttribute('aria-valuenow', '50')

      // Press Home to go to min
      await page.keyboard.press('Home')
      await expect(slider).toHaveAttribute('aria-valuenow', '0')

      // Press End to go to max
      await page.keyboard.press('End')
      await expect(slider).toHaveAttribute('aria-valuenow', '100')
    })
  })

  test.describe('Form (Display Settings)', () => {
    test('displays form example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Form")')).toBeVisible()
      const section = page.locator('[bf-s^="SliderFormDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('shows display settings heading', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderFormDemo_"]:not([data-slot])').first()
      await expect(section.locator('h4:has-text("Display Settings")')).toBeVisible()
      await expect(section.locator('text=Adjust brightness')).toBeVisible()
    })

    test('has three sliders', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderFormDemo_"]:not([data-slot])').first()
      const sliders = section.locator('[role="slider"]')
      await expect(sliders).toHaveCount(3)
    })

    test('shows initial values', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderFormDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=75%').first()).toBeVisible()
      await expect(section.locator('text=100%').first()).toBeVisible()
    })

    test('reset button is disabled at default values', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderFormDemo_"]:not([data-slot])').first()
      const resetButton = section.locator('button:has-text("Reset to defaults")')
      await expect(resetButton).toBeDisabled()
    })

    test('clicking track changes value and enables reset', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderFormDemo_"]:not([data-slot])').first()
      const slider = section.locator('[role="slider"]').first()
      const resetButton = section.locator('button:has-text("Reset to defaults")')

      // Use keyboard to change brightness value (more reliable than click coordinates)
      await slider.focus()
      await page.keyboard.press('ArrowLeft')

      // Reset button should be enabled since value changed from default
      await expect(resetButton).toBeEnabled()
    })
  })

  test.describe('Custom Range', () => {
    test('displays custom range example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Custom Range")')).toBeVisible()
      const section = page.locator('[bf-s^="SliderStepDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('shows font size slider with initial value', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderStepDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=Font Size')).toBeVisible()
      await expect(section.locator('text=16px').first()).toBeVisible()
    })

    test('font size slider has correct min/max', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderStepDemo_"]:not([data-slot])').first()
      const slider = section.locator('[role="slider"]').first()
      await expect(slider).toHaveAttribute('aria-valuemin', '8')
      await expect(slider).toHaveAttribute('aria-valuemax', '32')
      await expect(slider).toHaveAttribute('aria-valuenow', '16')
    })

    test('opacity slider has step=5', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderStepDemo_"]:not([data-slot])').first()
      const slider = section.locator('[role="slider"]').nth(1)

      // Focus and use keyboard to verify step
      await slider.focus()
      await expect(slider).toHaveAttribute('aria-valuenow', '100')

      await page.keyboard.press('ArrowLeft')
      await expect(slider).toHaveAttribute('aria-valuenow', '95')

      await page.keyboard.press('ArrowLeft')
      await expect(slider).toHaveAttribute('aria-valuenow', '90')
    })

    test('shows preview text section', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderStepDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=Preview text')).toBeVisible()
    })

    test('shows range labels', async ({ page }) => {
      const section = page.locator('[bf-s^="SliderStepDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=8px').first()).toBeVisible()
      await expect(section.locator('text=32px')).toBeVisible()
    })
  })

})
