import { test, expect } from '@playwright/test'

test.describe('Pie Chart Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/charts/pie-chart')
  })

  test.describe('Preview', () => {
    const scope = '[bf-s^="PieChartPreviewDemo_"]:not([data-slot])'

    test('renders an SVG chart', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('svg')).toBeVisible()
    })

    test('renders the correct number of slices', async ({ page }) => {
      const container = page.locator(scope)
      const slices = container.locator('path[data-key="tasks"]')
      await expect(slices).toHaveCount(4)
    })

    test('slices have correct data attributes', async ({ page }) => {
      const container = page.locator(scope)
      const slice = container.locator('path[data-name="done"]')
      await expect(slice).toHaveAttribute('data-value', '42')
    })
  })

  test.describe('Playground', () => {
    test('renders chart in playground preview', async ({ page }) => {
      const preview = page.locator('[data-pie-chart-preview]')
      await expect(preview).toBeVisible()
      await expect(preview.locator('svg').first()).toBeVisible()
    })

    test('renders 4 pie slices in playground', async ({ page }) => {
      const preview = page.locator('[data-pie-chart-preview]')
      const paths = preview.locator('path[data-key="tasks"]')
      await expect(paths).toHaveCount(4)
    })

    test('changing innerRadius updates the chart', async ({ page }) => {
      const preview = page.locator('[data-pie-chart-preview]')
      const path = preview.locator('path[data-key="tasks"]').first()

      // Get initial d attribute
      const initialD = await path.getAttribute('d')

      // Open the innerRadius select (first combobox in playground)
      const playgroundSection = page.locator('[data-pie-chart-preview]').locator('..').locator('..')
      const innerRadiusSelect = playgroundSection.locator('button[role="combobox"]').first()
      await innerRadiusSelect.click()
      await page.locator('[role="option"]:has-text("0.4")').click()

      // d attribute should change (donut shape)
      const updatedD = await path.getAttribute('d')
      expect(updatedD).not.toBe(initialD)
    })
  })

  test.describe('Basic', () => {
    test('renders an SVG with pie slices', async ({ page }) => {
      const container = page.locator('[bf-s^="PieChartBasicDemo_"]:not([data-slot])')
      await expect(container.locator('svg')).toBeVisible()
      const slices = container.locator('path[data-key="tasks"]')
      await expect(slices).toHaveCount(4)
    })
  })

  test.describe('Donut', () => {
    test('renders a donut chart with inner radius', async ({ page }) => {
      const container = page.locator('[bf-s^="PieChartDonutDemo_"]:not([data-slot])')
      const slices = container.locator('path[data-key="tasks"]')
      await expect(slices).toHaveCount(4)
    })
  })

  test.describe('Interactive', () => {
    test('switching metric updates the chart', async ({ page }) => {
      const section = page.locator('[bf-s^="PieChartInteractiveDemo_"]:not([data-slot])').first()

      // Initially shows tasks data
      await expect(section.locator('path[data-key="tasks"]')).toHaveCount(4)

      // Click Points button
      await section.locator('button:has-text("Points")').click()

      // Should now show points data
      await expect(section.locator('path[data-key="points"]')).toHaveCount(4)
      await expect(section.locator('path[data-key="tasks"]')).toHaveCount(0)
    })
  })

  test.describe('Animated', () => {
    const scope = '[bf-s^="PieChartAnimatedDemo_"]:not([data-slot])'

    test('renders 4 slices with reactive stroke + fill-opacity attributes', async ({ page }) => {
      const container = page.locator(scope)
      const paths = container.locator('path[data-anim-path]')
      await expect(paths).toHaveCount(4)
      // Initial progress is 1, so dashoffset starts at 0 (fully drawn) and
      // fill-opacity starts at 1 (fully visible). Math is normalised against
      // pathLength="1" so dasharray is "1", independent of geometric length.
      await expect(paths.first()).toHaveAttribute('stroke-dashoffset', '0')
      await expect(paths.first()).toHaveAttribute('stroke-dasharray', '1')
      await expect(paths.first()).toHaveAttribute('pathLength', '1')
      await expect(paths.first()).toHaveAttribute('fill-opacity', '1')
    })

    test('rAF loop drives stroke-dashoffset 1 → 0 on toggle', async ({ page }) => {
      const container = page.locator(scope)
      const toggle = container.locator('[data-anim-toggle]')
      const firstPath = container.locator('path[data-anim-path]').first()

      // Sanity: starts fully drawn.
      await expect(firstPath).toHaveAttribute('stroke-dashoffset', '0')

      await toggle.click()

      // The rAF tick should have pushed dashoffset away from 0 by the time
      // the next frame paints. Poll briefly to catch the mid-animation value.
      await expect
        .poll(
          async () => Number(await firstPath.getAttribute('stroke-dashoffset')),
          { timeout: 1000 },
        )
        .toBeGreaterThan(0)

      // After the animation duration completes, it returns to 0 and the
      // toggle becomes available again (effect cleanup released the frame).
      await expect
        .poll(
          async () => Number(await firstPath.getAttribute('stroke-dashoffset')),
          { timeout: 3000 },
        )
        .toBe(0)
      await expect(toggle).toBeEnabled()
    })

    test('rAF loop fades fill-opacity 0 → 1 so the slices visibly draw in', async ({ page }) => {
      // Regression guard for the original report ("animation not working
      // visually"): the previous implementation only animated the thin white
      // stroke separator between slices, which was imperceptible against the
      // solid fill. We now also animate `fill-opacity`, so the slices fade in
      // — that fade is what makes the animation visible.
      const container = page.locator(scope)
      const toggle = container.locator('[data-anim-toggle]')
      const firstPath = container.locator('path[data-anim-path]').first()

      await expect(firstPath).toHaveAttribute('fill-opacity', '1')

      await toggle.click()

      // Mid-animation, fill-opacity must drop strictly below 1 (slice is
      // partially transparent) and reach > 0 (animation has started).
      await expect
        .poll(
          async () => Number(await firstPath.getAttribute('fill-opacity')),
          { timeout: 1000 },
        )
        .toBeLessThan(1)

      // After the animation duration completes, fill-opacity is back to 1.
      await expect
        .poll(
          async () => Number(await firstPath.getAttribute('fill-opacity')),
          { timeout: 3000 },
        )
        .toBe(1)
    })
  })

  test.describe('Tooltip', () => {
    test('tooltip appears on slice hover', async ({ page }) => {
      const container = page.locator('[bf-s^="PieChartPreviewDemo_"]:not([data-slot])')
      const tooltip = container.locator('.chart-tooltip')

      // Tooltip should be hidden initially
      await expect(tooltip).toHaveCSS('opacity', '0')

      // Hover over a slice
      const slice = container.locator('path[data-name="done"]')
      await slice.hover()

      // Tooltip should become visible
      await expect(tooltip).toHaveCSS('opacity', '1')
    })
  })
})
