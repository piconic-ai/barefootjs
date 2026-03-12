import { test, expect } from '@playwright/test'

test.describe('Line Chart Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/charts/line-chart')
  })

  test.describe('Preview', () => {
    const scope = '[bf-s^="LineChartPreviewDemo_"]:not([data-slot])'

    test('renders an SVG chart', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('svg')).toBeVisible()
    })

    test('renders a line path', async ({ page }) => {
      const container = page.locator(scope)
      const path = container.locator('path[data-key="desktop"]')
      await expect(path).toHaveCount(1)
    })

    test('renders data point circles', async ({ page }) => {
      const container = page.locator(scope)
      const dots = container.locator('circle[data-key="desktop"]')
      await expect(dots).toHaveCount(6)
    })

    test('renders X axis labels', async ({ page }) => {
      const container = page.locator(scope)
      const xAxisTexts = container.locator('.chart-x-axis text')
      await expect(xAxisTexts.first()).toHaveText('Jan')
    })
  })

  test.describe('Playground', () => {
    test('renders chart in playground preview', async ({ page }) => {
      const preview = page.locator('[data-line-chart-preview]')
      await expect(preview).toBeVisible()
      await expect(preview.locator('svg').first()).toBeVisible()
    })

    test('renders 6 data point circles in playground', async ({ page }) => {
      const preview = page.locator('[data-line-chart-preview]')
      const circles = preview.locator('circle[data-key="desktop"]')
      await expect(circles).toHaveCount(6)
    })

    test('changing strokeWidth updates the line', async ({ page }) => {
      const preview = page.locator('[data-line-chart-preview]')
      const path = preview.locator('path[data-key="desktop"]')

      // Default strokeWidth is 2
      await expect(path).toHaveAttribute('stroke-width', '2')

      // Open the strokeWidth select (first combobox in the playground controls)
      const playgroundSection = page.locator('[data-line-chart-preview]').locator('..').locator('..')
      const strokeWidthSelect = playgroundSection.locator('button[role="combobox"]').first()
      await strokeWidthSelect.click()
      await page.locator('[role="option"]:has-text("4")').click()

      // stroke-width should be updated
      await expect(path).toHaveAttribute('stroke-width', '4')
    })

    test('toggling dots hides data point circles', async ({ page }) => {
      const preview = page.locator('[data-line-chart-preview]')

      // Initially has dots
      const initialCircleCount = await preview.locator('circle[data-key="desktop"]').count()
      expect(initialCircleCount).toBe(6)

      // Uncheck dots checkbox
      const dotsCheckbox = page.locator('text=dots')
        .locator('..')
        .locator('button[role="checkbox"]')
      await dotsCheckbox.click()

      // Circles should be gone
      const updatedCircleCount = await preview.locator('circle[data-key="desktop"]').count()
      expect(updatedCircleCount).toBe(0)
    })

    test('toggling showGrid hides grid lines', async ({ page }) => {
      const preview = page.locator('[data-line-chart-preview]')
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
    test('renders an SVG with a line path', async ({ page }) => {
      const container = page.locator('[bf-s^="LineChartBasicDemo_"]:not([data-slot])')
      await expect(container.locator('svg')).toBeVisible()
      const path = container.locator('path[data-key="desktop"]')
      await expect(path).toHaveCount(1)
    })
  })

  test.describe('Multiple', () => {
    test('renders both desktop and mobile lines', async ({ page }) => {
      const container = page.locator('[bf-s^="LineChartMultipleDemo_"]:not([data-slot])')
      const desktopPath = container.locator('path[data-key="desktop"]')
      const mobilePath = container.locator('path[data-key="mobile"]')
      await expect(desktopPath).toHaveCount(1)
      await expect(mobilePath).toHaveCount(1)
    })
  })

  test.describe('Interactive', () => {
    test('switching category updates the chart', async ({ page }) => {
      const section = page.locator('[bf-s^="LineChartInteractiveDemo_"]:not([data-slot])').first()

      // Initially shows desktop line
      await expect(section.locator('path[data-key="desktop"]')).toHaveCount(1)
      await expect(section.locator('path[data-key="mobile"]')).toHaveCount(0)

      // Click Mobile button
      await section.locator('button:has-text("Mobile")').click()

      // Should now show mobile line
      await expect(section.locator('path[data-key="mobile"]')).toHaveCount(1)
      await expect(section.locator('path[data-key="desktop"]')).toHaveCount(0)
    })
  })

  test.describe('Tooltip', () => {
    test('tooltip appears on dot hover', async ({ page }) => {
      const container = page.locator('[bf-s^="LineChartPreviewDemo_"]:not([data-slot])')
      const tooltip = container.locator('.chart-tooltip')

      // Tooltip should be hidden initially
      await expect(tooltip).toHaveCSS('opacity', '0')

      // Hover over a data point circle
      const dot = container.locator('circle[data-key="desktop"]').first()
      await dot.hover()

      // Tooltip should become visible
      await expect(tooltip).toHaveCSS('opacity', '1')
    })
  })
})
