import { test, expect } from '@playwright/test'

test.describe('Radial Chart Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/charts/radial-chart')
  })

  test.describe('Preview', () => {
    const scope = '[bf-s^="RadialChartPreviewDemo_"]:not([data-slot])'

    test('renders an SVG chart', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('svg')).toBeVisible()
    })

    test('renders arc paths for data', async ({ page }) => {
      const container = page.locator(scope)
      const arcs = container.locator('path[data-key="visitors"]')
      await expect(arcs).toHaveCount(5)
    })

    test('renders background tracks', async ({ page }) => {
      const container = page.locator(scope)
      // Background tracks have opacity 0.1
      const tracks = container.locator('path[opacity="0.1"]')
      await expect(tracks).toHaveCount(5)
    })
  })

  test.describe('Playground', () => {
    test('renders chart in playground preview', async ({ page }) => {
      const preview = page.locator('[data-radial-chart-preview]')
      await expect(preview).toBeVisible()
      await expect(preview.locator('svg').first()).toBeVisible()
    })

    test('renders arc paths in playground', async ({ page }) => {
      const preview = page.locator('[data-radial-chart-preview]')
      const arcs = preview.locator('path[data-key="visitors"]')
      await expect(arcs).toHaveCount(5)
    })

    test('changing innerRadius updates the chart', async ({ page }) => {
      const preview = page.locator('[data-radial-chart-preview]')
      const arc = preview.locator('path[data-key="visitors"]').first()

      // Get initial d attribute
      const initialD = await arc.getAttribute('d')

      // Open the innerRadius select
      const playgroundSection = page.locator('[data-radial-chart-preview]').locator('..').locator('..')
      const innerRadiusSelect = playgroundSection.locator('button[role="combobox"]').first()
      await innerRadiusSelect.click()
      await page.locator('[role="option"][data-value="0"]').click()

      // d attribute should change
      const updatedD = await arc.getAttribute('d')
      expect(updatedD).not.toBe(initialD)
    })

    test('changing endAngle updates arc extent', async ({ page }) => {
      const preview = page.locator('[data-radial-chart-preview]')
      const arc = preview.locator('path[data-key="visitors"]').first()

      // Get initial d attribute
      const initialD = await arc.getAttribute('d')

      // Open the endAngle select (second combobox)
      const playgroundSection = page.locator('[data-radial-chart-preview]').locator('..').locator('..')
      const endAngleSelect = playgroundSection.locator('button[role="combobox"]').nth(1)
      await endAngleSelect.click()
      await page.locator('[role="option"]:has-text("180")').click()

      // d attribute should change (half circle)
      const updatedD = await arc.getAttribute('d')
      expect(updatedD).not.toBe(initialD)
    })
  })

  test.describe('Basic', () => {
    test('renders an SVG with arcs', async ({ page }) => {
      const container = page.locator('[bf-s^="RadialChartBasicDemo_"]:not([data-slot])')
      await expect(container.locator('svg')).toBeVisible()
      const arcs = container.locator('path[data-key="visitors"]')
      await expect(arcs).toHaveCount(5)
    })
  })

  test.describe('Label', () => {
    test('renders center label', async ({ page }) => {
      const container = page.locator('[bf-s^="RadialChartLabelDemo_"]:not([data-slot])')
      await expect(container.locator('svg')).toBeVisible()
      const label = container.locator('.chart-radial-label')
      await expect(label).toBeVisible()
    })
  })

  test.describe('Half Circle', () => {
    test('renders half-circle radial chart', async ({ page }) => {
      const container = page.locator('[bf-s^="RadialChartHalfDemo_"]:not([data-slot])')
      await expect(container.locator('svg')).toBeVisible()
      const arcs = container.locator('path[data-key="visitors"]')
      await expect(arcs).toHaveCount(5)
    })
  })

  test.describe('Interactive', () => {
    test('switching data set updates the chart', async ({ page }) => {
      const section = page.locator('[bf-s^="RadialChartInteractiveDemo_"]:not([data-slot])').first()

      // Initially shows all 5 browsers
      await expect(section.locator('path[data-key="visitors"]')).toHaveCount(5)

      // Click Top 3 button
      await section.locator('button:has-text("Top 3")').click()

      // Should now show only 3 arcs
      await expect(section.locator('path[data-key="visitors"]')).toHaveCount(3)
    })
  })
})
