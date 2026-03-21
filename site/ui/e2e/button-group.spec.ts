import { test, expect } from '@playwright/test'

test.describe('Button Group Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/button-group')
  })

  test.describe('Rendering', () => {
    test('displays button-group elements with data-slot', async ({ page }) => {
      const groups = page.locator('[data-slot="button-group"]')
      await expect(groups.first()).toBeVisible()
    })

    test('has role=group', async ({ page }) => {
      const group = page.locator('[data-slot="button-group"]').first()
      await expect(group).toHaveAttribute('role', 'group')
    })
  })

  test.describe('Playground', () => {
    test('displays playground with buttons', async ({ page }) => {
      const preview = page.locator('#preview')
      const group = preview.locator('[data-slot="button-group"]').first()
      await expect(group).toBeVisible()

      const buttons = group.locator('button')
      await expect(buttons).toHaveCount(3)
    })

    test('orientation selector changes layout', async ({ page }) => {
      const preview = page.locator('#preview')
      const group = preview.locator('[data-slot="button-group"]').first()

      // Default: horizontal
      await expect(group).toHaveAttribute('data-orientation', 'horizontal')
    })
  })

  test.describe('Separator Example', () => {
    test('has save button and icon button', async ({ page }) => {
      const section = page.locator('#separator').locator('..')
      await expect(section.locator('button:has-text("Save")')).toBeVisible()
      await expect(section.locator('button[aria-label="More save options"]')).toBeVisible()
    })
  })

  test.describe('Vertical Example', () => {
    test('has vertical orientation', async ({ page }) => {
      const section = page.locator('#vertical').locator('..')
      const group = section.locator('[data-slot="button-group"]')
      await expect(group).toHaveAttribute('data-orientation', 'vertical')
    })

    test('has three buttons', async ({ page }) => {
      const section = page.locator('#vertical').locator('..')
      const group = section.locator('[data-slot="button-group"]')
      const buttons = group.locator('button')
      await expect(buttons).toHaveCount(3)
    })
  })

  test.describe('With Text Example', () => {
    test('displays quantity counter', async ({ page }) => {
      const section = page.locator('#with-text').locator('..')
      const group = section.locator('[data-slot="button-group"]')
      await expect(group).toBeVisible()
      await expect(section.locator('button[aria-label="Decrease"]')).toBeVisible()
      await expect(section.locator('button[aria-label="Increase"]')).toBeVisible()
    })
  })
})
