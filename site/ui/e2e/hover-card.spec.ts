import { test, expect } from '@playwright/test'

test.describe('Hover Card Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/hover-card')
  })

  test.describe('Preview Demo', () => {
    test('opens hover card on trigger hover', async ({ page }) => {
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')

      await trigger.hover()

      const content = page.locator('[data-slot="hover-card-content"][data-state="open"]')
      await expect(content).toBeVisible({ timeout: 3000 })
      await expect(content.getByText('@barefootjs')).toBeVisible()
    })

    test('closes after mouse leaves trigger', async ({ page }) => {
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"][bf-r]').first()
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
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')

      await trigger.hover()

      // Scoped by `bf-h`, not just `[data-state="open"]` — see the comment
      // on the identical scoping in "has correct data-state transitions"
      // below: every HoverCard instance's portal-placed content (including
      // the Playground demo's own, closed one) now shares one outlet as
      // flat siblings, and a closed instance sitting on top in that shared
      // stacking order can intercept the mouse move onto an unscoped match.
      const content = page.locator('[data-slot="hover-card-content"][data-state="open"][bf-h^="HoverCardPreviewDemo_"]')
      await expect(content).toBeVisible({ timeout: 3000 })

      // Move mouse to content - should stay open
      await content.hover()

      // Wait a bit to ensure it stays open
      await page.waitForTimeout(500)
      await expect(content).toBeVisible()
    })

    test('has correct data-state transitions', async ({ page }) => {
      // Scoped by `bf-h` (this instance's own host prefix), not `.first()` in
      // document order: the portal-placed content of every HoverCard instance
      // on this page (including the Playground demo's own) now shares one
      // outlet, so document order no longer matches the page's visual section
      // order — `.first()` picked a DIFFERENT instance's content once #3059
      // moved portal content into that outlet.
      const content = page.locator('[data-slot="hover-card-content"][bf-h^="HoverCardPreviewDemo_"]')

      // Initially closed
      await expect(content).toHaveAttribute('data-state', 'closed')

      // Hover to open
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')
      await trigger.hover()

      await expect(content).toHaveAttribute('data-state', 'open', { timeout: 3000 })

      // Move away to close
      await page.locator('h1').hover()
      await expect(content).toHaveAttribute('data-state', 'closed', { timeout: 3000 })
    })

    test('closes on ESC key', async ({ page }) => {
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')

      await trigger.hover()

      const content = page.locator('[data-slot="hover-card-content"][data-state="open"]')
      await expect(content).toBeVisible({ timeout: 3000 })

      await page.keyboard.press('Escape')
      await expect(content).toHaveCount(0)
    })

    test('has correct aria-expanded on trigger', async ({ page }) => {
      const demo = page.locator('[bf-s^="HoverCardPreviewDemo_"][bf-r]').first()
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
      const demo = page.locator('[bf-s^="HoverCardBasicDemo_"][bf-r]').first()
      const trigger = demo.locator('[data-slot="hover-card-trigger"]')

      await trigger.hover()

      const content = page.locator('[data-slot="hover-card-content"][data-state="open"]')
      await expect(content).toBeVisible({ timeout: 3000 })
      await expect(content.getByText('HoverCard')).toBeVisible()
    })
  })

})
