import { test, expect } from '@playwright/test'

test.describe('Scroll Area Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/scroll-area')
  })

  test.describe('ScrollArea Rendering', () => {
    test('displays scroll area elements', async ({ page }) => {
      const scrollAreas = page.locator('[data-slot="scroll-area"]')
      await expect(scrollAreas.first()).toBeVisible()
    })

    test('has multiple scroll area examples', async ({ page }) => {
      const scrollAreas = page.locator('[data-slot="scroll-area"]')
      // Playground + Usage + Horizontal + Both Axes
      expect(await scrollAreas.count()).toBeGreaterThanOrEqual(3)
    })
  })

  test.describe('Usage (Tags Demo)', () => {
    test('displays tags list in scrollable area', async ({ page }) => {
      const scrollArea = page.locator('[data-slot="scroll-area"]').first()
      await expect(scrollArea).toBeVisible()
      await expect(scrollArea.locator('text=Tags')).toBeVisible()
    })

    test('shows version tags', async ({ page }) => {
      // Usage section tags demo (not the playground) has data-tag attributes
      const tagsDemo = page.locator('[data-slot="scroll-area"]').filter({ has: page.locator('[data-tag]') }).first()
      await expect(tagsDemo.locator('[data-tag="v1.2.0-beta.50"]')).toBeVisible()
    })

    test('has scrollable viewport', async ({ page }) => {
      const scrollArea = page.locator('[data-slot="scroll-area"]').first()
      const viewport = scrollArea.locator('[data-slot="scroll-area-viewport"]')
      await expect(viewport).toBeVisible()

      const overflowStyle = await viewport.evaluate(
        (el) => window.getComputedStyle(el).overflow
      )
      expect(overflowStyle).toContain('scroll')
    })

    test('has vertical scrollbar', async ({ page }) => {
      const scrollArea = page.locator('[data-slot="scroll-area"]').first()
      const scrollbar = scrollArea.locator('[data-slot="scroll-area-scrollbar"][data-orientation="vertical"]')
      await expect(scrollbar).toBeAttached()
    })
  })

  test.describe('Playground Type Prop', () => {
    test('type="always" keeps scrollbar visible without hover', async ({ page }) => {
      const playgroundRoot = page.locator('#preview')
      await expect(playgroundRoot).toBeVisible()

      // Select "always" type via playground control
      const trigger = playgroundRoot.locator('[data-slot="select-trigger"]').first()
      await trigger.click()
      await page.locator('[data-slot="select-item"]:has-text("always")').click()

      // Move mouse away from the scroll area to ensure we're not hovering
      await page.mouse.move(0, 0)
      await page.waitForTimeout(500)

      // Verify scrollbar is visible via computed opacity (style effect is reactive)
      const scrollbar = playgroundRoot.locator('[data-scroll-area-preview] [data-slot="scroll-area-scrollbar"][data-orientation="vertical"]')
      await expect(scrollbar).toHaveCSS('opacity', '1')
    })

    test('type="hover" hides scrollbar when not hovered', async ({ page }) => {
      const playgroundRoot = page.locator('#preview')
      await expect(playgroundRoot).toBeVisible()

      // Default is "hover", move mouse away
      await page.mouse.move(0, 0)
      await page.waitForTimeout(500)

      // Verify scrollbar is hidden via computed opacity
      const scrollbar = playgroundRoot.locator('[data-scroll-area-preview] [data-slot="scroll-area-scrollbar"][data-orientation="vertical"]')
      await expect(scrollbar).toHaveCSS('opacity', '0')
    })
  })

  test.describe('Horizontal Demo', () => {
    test('displays horizontal scroll example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Horizontal Scrolling")')).toBeVisible()
    })

    test('shows artwork titles', async ({ page }) => {
      await expect(page.locator('text=Sunset Horizon')).toBeVisible()
    })
  })

  test.describe('Both Axes Demo', () => {
    test('displays both axes example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Both Axes")')).toBeVisible()
    })

    test('shows changelog content', async ({ page }) => {
      await expect(page.locator('h4:has-text("Changelog")')).toBeVisible()
    })
  })
})
