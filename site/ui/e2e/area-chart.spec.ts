import { test, expect } from '@playwright/test'

test.describe('Area Chart Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/charts/area-chart')
  })

  test.describe('Preview', () => {
    const scope = '[bf-s^="AreaChartPreviewDemo_"]:not([data-slot])'

    test('renders an SVG chart', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('svg')).toBeVisible()
    })

    test('renders area path', async ({ page }) => {
      const container = page.locator(scope)
      const areas = container.locator('path[data-key="desktop"]')
      // Two paths per area: fill path + stroke path
      await expect(areas).toHaveCount(2)
    })

    test('renders X axis labels', async ({ page }) => {
      const container = page.locator(scope)
      const xAxisTexts = container.locator('.chart-x-axis text')
      await expect(xAxisTexts.first()).toHaveText('Jan')
    })
  })

  test.describe('Playground', () => {
    test('renders chart in playground preview', async ({ page }) => {
      const preview = page.locator('[data-area-chart-preview]')
      await expect(preview).toBeVisible()
      await expect(preview.locator('svg').first()).toBeVisible()
    })

    test('renders area paths in playground', async ({ page }) => {
      const preview = page.locator('[data-area-chart-preview]')
      const paths = preview.locator('path[data-key="desktop"]')
      await expect(paths).toHaveCount(2)
    })

    test('changing fillOpacity updates area', async ({ page }) => {
      const preview = page.locator('[data-area-chart-preview]')
      const areaPath = preview.locator('path[data-key="desktop"]').first()

      // Default fillOpacity is 0.2
      await expect(areaPath).toHaveAttribute('fill-opacity', '0.2')

      // Open the fillOpacity select
      const playgroundSection = page.locator('[data-area-chart-preview]').locator('..').locator('..')
      const opacitySelect = playgroundSection.locator('button[role="combobox"]').first()
      await opacitySelect.click()
      await page.locator('[role="option"]:has-text("0.4")').click()

      // fill-opacity should update
      await expect(areaPath).toHaveAttribute('fill-opacity', '0.4')
    })

    test('toggling vertical grid adds vertical lines', async ({ page }) => {
      const preview = page.locator('[data-area-chart-preview]')
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
      const preview = page.locator('[data-area-chart-preview]')
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

      // Grid lines should be gone
      const updatedLineCount = await gridGroup.locator('line').count()
      expect(updatedLineCount).toBe(0)
    })
  })

  test.describe('Basic', () => {
    test('renders an SVG with area paths', async ({ page }) => {
      const container = page.locator('[bf-s^="AreaChartBasicDemo_"]:not([data-slot])')
      await expect(container.locator('svg')).toBeVisible()
      const paths = container.locator('path[data-key="desktop"]')
      await expect(paths).toHaveCount(2)
    })
  })

  test.describe('Multiple', () => {
    test('renders both desktop and mobile areas', async ({ page }) => {
      const container = page.locator('[bf-s^="AreaChartMultipleDemo_"]:not([data-slot])')
      const desktopPaths = container.locator('path[data-key="desktop"]')
      const mobilePaths = container.locator('path[data-key="mobile"]')
      await expect(desktopPaths).toHaveCount(2)
      await expect(mobilePaths).toHaveCount(2)
    })
  })

  test.describe('Interactive', () => {
    test('switching category updates the chart', async ({ page }) => {
      const section = page.locator('[bf-s^="AreaChartInteractiveDemo_"]:not([data-slot])').first()

      // Initially shows desktop area
      await expect(section.locator('path[data-key="desktop"]')).toHaveCount(2)
      await expect(section.locator('path[data-key="mobile"]')).toHaveCount(0)

      // Click Mobile button
      await section.locator('button:has-text("Mobile")').click()

      // Should now show mobile area
      await expect(section.locator('path[data-key="mobile"]')).toHaveCount(2)
      await expect(section.locator('path[data-key="desktop"]')).toHaveCount(0)
    })
  })

  test.describe('Tooltip', () => {
    test('tooltip appears on area hover', async ({ page }) => {
      const container = page.locator('[bf-s^="AreaChartPreviewDemo_"]:not([data-slot])')
      const tooltip = container.locator('.chart-tooltip')

      // Tooltip should be hidden initially
      await expect(tooltip).toHaveCSS('opacity', '0')

      // Hover over an area dot
      const dot = container.locator('.chart-area-dot').first()
      await dot.hover()

      // Tooltip should become visible
      await expect(tooltip).toHaveCSS('opacity', '1')
    })
  })
})
