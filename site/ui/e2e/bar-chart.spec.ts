import { test, expect } from '@playwright/test'

test.describe('Bar Chart Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/charts/bar-chart')
  })

  test.describe('Preview', () => {
    const scope = '[bf-s^="BarChartPreviewDemo_"]:not([data-slot])'

    test('renders an SVG chart', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('svg')).toBeVisible()
    })

    test('renders the correct number of bars', async ({ page }) => {
      const container = page.locator(scope)
      const bars = container.locator('rect[data-key="desktop"]')
      await expect(bars).toHaveCount(6)
    })

    test('renders X axis labels', async ({ page }) => {
      const container = page.locator(scope)
      const xAxisTexts = container.locator('.chart-x-axis text')
      await expect(xAxisTexts.first()).toHaveText('Jan')
    })
  })

  test.describe('Playground', () => {
    test('renders chart in playground preview', async ({ page }) => {
      const preview = page.locator('[data-bar-chart-preview]')
      await expect(preview).toBeVisible()
      await expect(preview.locator('svg').first()).toBeVisible()
    })

    test('renders 6 bar rects in playground', async ({ page }) => {
      const preview = page.locator('[data-bar-chart-preview]')
      const rects = preview.locator('rect[data-key="desktop"]')
      await expect(rects).toHaveCount(6)
    })

    test('changing radius updates bar corners', async ({ page }) => {
      const preview = page.locator('[data-bar-chart-preview]')
      const rect = preview.locator('rect[data-key="desktop"]').first()

      // Default radius is 4
      await expect(rect).toHaveAttribute('rx', '4')

      // Open the radius select (first combobox in the playground controls)
      const playgroundSection = page.locator('[data-bar-chart-preview]').locator('..').locator('..')
      const radiusSelect = playgroundSection.locator('button[role="combobox"]').first()
      await radiusSelect.click()
      await page.locator('[role="option"]:has-text("0")').click()

      // rx attribute should be removed (radius=0 means no rounding)
      await expect(rect).not.toHaveAttribute('rx')
    })

    test('toggling vertical grid adds vertical lines', async ({ page }) => {
      const preview = page.locator('[data-bar-chart-preview]')
      const gridGroup = preview.locator('.chart-grid')
      await expect(gridGroup).toBeVisible()

      // Count initial lines (horizontal only, vertical=false by default)
      const initialLineCount = await gridGroup.locator('line').count()

      // Click "vertical grid" checkbox
      const verticalCheckbox = page.locator('text=vertical grid')
        .locator('..')
        .locator('button[role="checkbox"]')
      await verticalCheckbox.click()

      // Should have more lines (horizontal + vertical)
      const updatedLineCount = await gridGroup.locator('line').count()
      expect(updatedLineCount).toBeGreaterThan(initialLineCount)
    })

    test('toggling showGrid hides grid lines', async ({ page }) => {
      const preview = page.locator('[data-bar-chart-preview]')
      const gridGroup = preview.locator('.chart-grid')
      await expect(gridGroup).toBeVisible()

      // Initially has grid lines
      const initialLineCount = await gridGroup.locator('line').count()
      expect(initialLineCount).toBeGreaterThan(0)

      // Uncheck showGrid
      const showGridCheckbox = page.locator('text=showGrid')
        .locator('..')
        .locator('button[role="checkbox"]')
      await showGridCheckbox.click()

      // Grid lines should be gone (horizontal=false hides all lines)
      const updatedLineCount = await gridGroup.locator('line').count()
      expect(updatedLineCount).toBe(0)
    })
  })

  test.describe('Basic', () => {
    test('renders an SVG with bars', async ({ page }) => {
      const container = page.locator('[bf-s^="BarChartBasicDemo_"]:not([data-slot])')
      await expect(container.locator('svg')).toBeVisible()
      const bars = container.locator('rect[data-key="desktop"]')
      await expect(bars).toHaveCount(6)
    })
  })

  test.describe('Multiple', () => {
    test('renders both desktop and mobile bars', async ({ page }) => {
      const container = page.locator('[bf-s^="BarChartMultipleDemo_"]:not([data-slot])')
      const desktopBars = container.locator('rect[data-key="desktop"]')
      const mobileBars = container.locator('rect[data-key="mobile"]')
      await expect(desktopBars).toHaveCount(6)
      await expect(mobileBars).toHaveCount(6)
    })
  })

  test.describe('Interactive', () => {
    test('switching category updates the chart', async ({ page }) => {
      const section = page.locator('[bf-s^="BarChartInteractiveDemo_"]:not([data-slot])').first()

      // Initially shows desktop bars
      await expect(section.locator('rect[data-key="desktop"]')).toHaveCount(6)
      await expect(section.locator('rect[data-key="mobile"]')).toHaveCount(0)

      // Click Mobile button
      await section.locator('button:has-text("Mobile")').click()

      // Should now show mobile bars
      await expect(section.locator('rect[data-key="mobile"]')).toHaveCount(6)
      await expect(section.locator('rect[data-key="desktop"]')).toHaveCount(0)
    })
  })

  test.describe('Tooltip', () => {
    test('tooltip appears on bar hover', async ({ page }) => {
      const container = page.locator('[bf-s^="BarChartPreviewDemo_"]:not([data-slot])')
      const tooltip = container.locator('.chart-tooltip')

      // Tooltip should be hidden initially
      await expect(tooltip).toHaveCSS('opacity', '0')

      // Hover over a bar
      const bar = container.locator('rect[data-key="desktop"]').first()
      await bar.hover()

      // Tooltip should become visible
      await expect(tooltip).toHaveCSS('opacity', '1')
    })
  })
})
