import { test, expect } from '@playwright/test'

test.describe('Radar Chart Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/charts/radar-chart')
  })

  test.describe('Preview', () => {
    const scope = '[bf-s^="RadarChartPreviewDemo_"]:not([data-slot])'

    test('renders an SVG chart', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('svg')).toBeVisible()
    })

    test('renders the radar polygon', async ({ page }) => {
      const container = page.locator(scope)
      const polygon = container.locator('polygon[data-key="desktop"]')
      await expect(polygon).toHaveCount(1)
    })

    test('renders data point dots', async ({ page }) => {
      const container = page.locator(scope)
      const dots = container.locator('circle[data-key="desktop"]')
      await expect(dots).toHaveCount(6)
    })

    test('renders angle axis labels', async ({ page }) => {
      const container = page.locator(scope)
      const axisTexts = container.locator('.chart-polar-angle-axis text')
      await expect(axisTexts.first()).toHaveText('Jan')
    })
  })

  test.describe('Playground', () => {
    test('renders chart in playground preview', async ({ page }) => {
      const preview = page.locator('[data-radar-chart-preview]')
      await expect(preview).toBeVisible()
      await expect(preview.locator('svg').first()).toBeVisible()
    })

    test('renders radar polygon in playground', async ({ page }) => {
      const preview = page.locator('[data-radar-chart-preview]')
      const polygon = preview.locator('polygon[data-key="desktop"]')
      await expect(polygon).toHaveCount(1)
    })

    test('changing fillOpacity updates polygon', async ({ page }) => {
      const preview = page.locator('[data-radar-chart-preview]')
      const polygon = preview.locator('polygon[data-key="desktop"]')

      // Default opacity is 0.6
      await expect(polygon).toHaveAttribute('fill-opacity', '0.6')

      // Open the fillOpacity select (first combobox in the playground controls)
      const playgroundSection = page.locator('[data-radar-chart-preview]').locator('..').locator('..')
      const opacitySelect = playgroundSection.locator('button[role="combobox"]').first()
      await opacitySelect.click()
      await page.locator('[role="option"]:has-text("0.2")').click()

      // Opacity should update
      await expect(polygon).toHaveAttribute('fill-opacity', '0.2')
    })

    test('changing gridType switches to circle grid', async ({ page }) => {
      const preview = page.locator('[data-radar-chart-preview]')

      // Default: polygon grid (no circles in grid)
      const gridGroup = preview.locator('.chart-polar-grid')
      await expect(gridGroup).toBeVisible()
      await expect(gridGroup.locator('polygon').first()).toBeVisible()

      // Switch to circle grid
      const playgroundSection = page.locator('[data-radar-chart-preview]').locator('..').locator('..')
      const gridTypeSelect = playgroundSection.locator('button[role="combobox"]').nth(1)
      await gridTypeSelect.click()
      await page.locator('[role="option"]:has-text("circle")').click()

      // Should have circles instead of polygons in grid
      await expect(gridGroup.locator('circle').first()).toBeVisible()
    })

    test('toggling showGrid hides grid lines', async ({ page }) => {
      const preview = page.locator('[data-radar-chart-preview]')
      const gridGroup = preview.locator('.chart-polar-grid')
      await expect(gridGroup).toBeVisible()

      // Initially has grid elements (polygons + lines)
      const initialChildCount = await gridGroup.locator('polygon, line, circle').count()
      expect(initialChildCount).toBeGreaterThan(0)

      // Uncheck showGrid
      const showGridCheckbox = page.locator('text=showGrid')
        .locator('..')
        .locator('button[role="checkbox"]')
      await showGridCheckbox.click()

      // Grid group still exists but should have no children
      const updatedChildCount = await gridGroup.locator('polygon, line, circle').count()
      expect(updatedChildCount).toBe(0)
    })
  })

  test.describe('Basic', () => {
    test('renders an SVG with radar polygon', async ({ page }) => {
      const container = page.locator('[bf-s^="RadarChartBasicDemo_"]:not([data-slot])')
      await expect(container.locator('svg')).toBeVisible()
      const polygon = container.locator('polygon[data-key="desktop"]')
      await expect(polygon).toHaveCount(1)
    })
  })

  test.describe('Multiple', () => {
    test('renders both desktop and mobile radar polygons', async ({ page }) => {
      const container = page.locator('[bf-s^="RadarChartMultipleDemo_"]:not([data-slot])')
      const desktopPolygon = container.locator('polygon[data-key="desktop"]')
      const mobilePolygon = container.locator('polygon[data-key="mobile"]')
      await expect(desktopPolygon).toHaveCount(1)
      await expect(mobilePolygon).toHaveCount(1)
    })
  })

  test.describe('Interactive', () => {
    test('switching category updates the chart', async ({ page }) => {
      const section = page.locator('[bf-s^="RadarChartInteractiveDemo_"]:not([data-slot])').first()

      // Initially shows desktop polygon
      await expect(section.locator('polygon[data-key="desktop"]')).toHaveCount(1)
      await expect(section.locator('polygon[data-key="mobile"]')).toHaveCount(0)

      // Click Mobile button
      await section.locator('button:has-text("Mobile")').click()

      // Should now show mobile polygon
      await expect(section.locator('polygon[data-key="mobile"]')).toHaveCount(1)
      await expect(section.locator('polygon[data-key="desktop"]')).toHaveCount(0)
    })
  })

  test.describe('Tooltip', () => {
    test('tooltip appears on dot hover', async ({ page }) => {
      const container = page.locator('[bf-s^="RadarChartPreviewDemo_"]:not([data-slot])')
      const tooltip = container.locator('.chart-tooltip')

      // Tooltip should be hidden initially
      await expect(tooltip).toHaveCSS('opacity', '0')

      // Hover over a data point dot
      const dot = container.locator('circle[data-key="desktop"]').first()
      await dot.hover()

      // Tooltip should become visible
      await expect(tooltip).toHaveCSS('opacity', '1')
    })
  })
})
