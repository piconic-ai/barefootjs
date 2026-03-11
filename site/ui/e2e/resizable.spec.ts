import { test, expect } from '@playwright/test'

test.describe('Resizable Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/resizable')
  })

  test.describe('Resizable Rendering', () => {
    test('displays resizable panel groups', async ({ page }) => {
      const groups = page.locator('[data-slot="resizable-panel-group"]')
      await expect(groups.first()).toBeVisible()
    })

    test('has multiple examples', async ({ page }) => {
      const groups = page.locator('[data-slot="resizable-panel-group"]')
      // Playground + Usage + Horizontal + Vertical + With Handle + Three Panels
      expect(await groups.count()).toBeGreaterThanOrEqual(4)
    })
  })

  test.describe('Horizontal Example', () => {
    test('displays two panels', async ({ page }) => {
      await expect(page.locator('h3:has-text("Horizontal")')).toBeVisible()
      const section = page.locator('#horizontal').locator('..')
      const group = section.locator('[data-slot="resizable-panel-group"]')
      await expect(group).toBeVisible()
      await expect(group.locator('text=One')).toBeVisible()
      await expect(group.locator('text=Two')).toBeVisible()
    })
  })

  test.describe('Vertical Example', () => {
    test('displays vertical layout', async ({ page }) => {
      await expect(page.locator('h3:has-text("Vertical")')).toBeVisible()
      const group = page.locator('[data-panel-group-direction="vertical"]')
      await expect(group.first()).toBeVisible()
    })
  })

  test.describe('With Handle Example', () => {
    test('displays grip dots', async ({ page }) => {
      await expect(page.locator('h3:has-text("With Handle")')).toBeVisible()

      // Should have SVG grip icon inside a handle
      const handles = page.locator('[data-slot="resizable-handle"] svg')
      expect(await handles.count()).toBeGreaterThanOrEqual(1)
    })
  })

  test.describe('Three Panels Example', () => {
    test('displays three panels with handles', async ({ page }) => {
      await expect(page.locator('h3:has-text("Three Panels")')).toBeVisible()

      // Find a group with 3 panels
      const groups = page.locator('[data-slot="resizable-panel-group"][data-panel-group-direction="horizontal"]')
      const groupCount = await groups.count()

      let threePanelGroup = null
      for (let i = 0; i < groupCount; i++) {
        const group = groups.nth(i)
        const panelCount = await group.locator('[data-slot="resizable-panel"]').count()
        if (panelCount === 3) {
          threePanelGroup = group
          break
        }
      }
      expect(threePanelGroup).toBeTruthy()
      const panels = threePanelGroup!.locator('[data-slot="resizable-panel"]')
      await expect(panels).toHaveCount(3)

      const handles = threePanelGroup!.locator('[data-slot="resizable-handle"]')
      await expect(handles).toHaveCount(2)
    })

    test('panels show correct labels', async ({ page }) => {
      await expect(page.locator('text=Sidebar').first()).toBeVisible()
      await expect(page.locator('text=Content').first()).toBeVisible()
      await expect(page.locator('text=Aside').first()).toBeVisible()
    })
  })

  test.describe('Keyboard Support', () => {
    test('handle is focusable', async ({ page }) => {
      const handle = page.locator('[data-slot="resizable-handle"]').first()
      await expect(handle).toHaveAttribute('tabindex', '0')
    })
  })
})
