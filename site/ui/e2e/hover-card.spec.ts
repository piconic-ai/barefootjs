import { test, expect } from '@playwright/test'

test.describe('Hover Card Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/hover-card')
  })

  test.describe('Preview Demo', () => {
    test('opens hover card on trigger hover', async ({ page }) => {
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')

      await trigger.hover()

      const content = page.locator('[data-slot="hover-card-content"][data-state="open"]')
      await expect(content).toBeVisible({ timeout: 3000 })
      await expect(content.getByText('@barefootjs')).toBeVisible()
    })

    test('closes after mouse leaves trigger', async ({ page }) => {
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')

      await trigger.hover()

      const content = page.locator('[data-slot="hover-card-content"][data-state="open"]')
      await expect(content).toBeVisible({ timeout: 3000 })

      // Move mouse away from trigger
      await page.locator('h1').hover()

      // Wait for close delay (300ms) + transition
      await expect(content).toHaveCount(0, { timeout: 3000 })
    })

    test('stays open when hovering content', async ({ page }) => {
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')

      await trigger.hover()

      const content = page.locator('[data-slot="hover-card-content"][data-state="open"]')
      await expect(content).toBeVisible({ timeout: 3000 })

      // Move mouse to content - should stay open
      await content.hover()

      // Wait a bit to ensure it stays open
      await page.waitForTimeout(500)
      await expect(content).toBeVisible()
    })

    test('has correct data-state transitions', async ({ page }) => {
      const content = page.locator('[data-slot="hover-card-content"]').first()

      // Initially closed
      await expect(content).toHaveAttribute('data-state', 'closed')

      // Hover to open
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')
      await trigger.hover()

      await expect(content).toHaveAttribute('data-state', 'open', { timeout: 3000 })

      // Move away to close
      await page.locator('h1').hover()
      await expect(content).toHaveAttribute('data-state', 'closed', { timeout: 3000 })
    })

    test('closes on ESC key', async ({ page }) => {
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')

      await trigger.hover()

      const content = page.locator('[data-slot="hover-card-content"][data-state="open"]')
      await expect(content).toBeVisible({ timeout: 3000 })

      await page.keyboard.press('Escape')
      await expect(content).toHaveCount(0)
    })

    test('has correct aria-expanded on trigger', async ({ page }) => {
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')

      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await trigger.hover()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true', { timeout: 3000 })

      await page.keyboard.press('Escape')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })
  })

  test.describe('Basic Demo', () => {
    test('opens and shows content on hover', async ({ page }) => {
      const demo = page.locator('[bf-s^="HoverCardBasicDemo_"]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')

      await trigger.hover()

      const content = page.locator('[data-slot="hover-card-content"][data-state="open"]')
      await expect(content).toBeVisible({ timeout: 3000 })
      await expect(content.getByText('HoverCard')).toBeVisible()
    })
  })

})
