import { test, expect } from '@playwright/test'

// E2E coverage for the JSX-native xyflow components shipped via the
// shadcn registry. Static-structure assertions only — pan / zoom / drag
// / connection-drag interactivity tests come back online once cutover
// step C4 attaches the imperative pointer-paced subsystems via the
// `<Flow>` `ref` callback. The corresponding `test.describe.skip`
// blocks below are removed in C4.

test.describe('xyflow Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/xyflow')
  })

  // ------------------------------------------------------------
  test.describe('Preview', () => {
    const scope = '[bf-s^="XyflowPreviewDemo_"]:not([data-slot])'

    test('renders the .bf-flow root', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('.bf-flow').first()).toBeVisible()
    })

    test('renders the viewport wrapper', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('.bf-flow__viewport').first()).toBeAttached()
    })

    test('renders the edges <svg> layer', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('svg.bf-flow__edges').first()).toBeAttached()
    })

    test('renders four nodes from initialNodes', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('.bf-flow__node')).toHaveCount(4)
    })

    test('renders four edges as <path data-id>', async ({ page }) => {
      const container = page.locator(scope)
      // Visible path + invisible hit-area path per edge → 8 total path
      // elements with edge id markers.
      await expect(container.locator('.bf-flow__edge[data-id]')).toHaveCount(4)
      await expect(container.locator('path[data-hit-id]')).toHaveCount(4)
    })

    test('node labels are present', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('.bf-flow__node[data-id="1"]')).toBeAttached()
      await expect(container.locator('.bf-flow__node[data-id="4"]')).toBeAttached()
    })
  })

  // ------------------------------------------------------------
  test.describe('Background Plugin', () => {
    const scope = '[bf-s^="XyflowPreviewDemo_"]:not([data-slot])'

    test('renders an SVG <pattern>', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('pattern').first()).toBeAttached()
    })

    test('pattern has explicit width / height attributes', async ({ page }) => {
      const container = page.locator(scope)
      const pattern = container.locator('pattern').first()
      const width = await pattern.getAttribute('width')
      const height = await pattern.getAttribute('height')
      expect(Number(width)).toBeGreaterThan(0)
      expect(Number(height)).toBeGreaterThan(0)
    })

    test('full-size <rect> fills the background', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('svg rect[width="100%"]').first()).toBeAttached()
    })
  })

  // ------------------------------------------------------------
  test.describe('Controls Plugin', () => {
    const scope = '[bf-s^="XyflowPreviewDemo_"]:not([data-slot])'

    test('renders four control buttons', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('.bf-flow__controls-button')).toHaveCount(4)
    })

    test('buttons carry nodrag / nowheel classes', async ({ page }) => {
      const container = page.locator(scope)
      const btn = container.locator('.bf-flow__controls-button').first()
      await expect(btn).toHaveClass(/nodrag/)
      await expect(btn).toHaveClass(/nowheel/)
    })

    test('buttons expose the four control titles', async ({ page }) => {
      const container = page.locator(scope)
      const titles = await container
        .locator('.bf-flow__controls-button')
        .evaluateAll((els) => els.map((e) => (e as HTMLElement).title))
      expect(titles).toEqual(['Zoom in', 'Zoom out', 'Fit view', 'Toggle interactivity'])
    })
  })

  // ------------------------------------------------------------
  test.describe('MiniMap Plugin', () => {
    const scope = '[bf-s^="XyflowPreviewDemo_"]:not([data-slot])'

    test('renders the minimap container', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('.bf-flow__minimap').first()).toBeVisible()
    })

    test('minimap carries nopan / nowheel / nodrag classes', async ({ page }) => {
      const container = page.locator(scope)
      const minimap = container.locator('.bf-flow__minimap').first()
      await expect(minimap).toHaveClass(/nopan/)
      await expect(minimap).toHaveClass(/nowheel/)
      await expect(minimap).toHaveClass(/nodrag/)
    })

    test('renders the viewport mask path', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('.bf-flow__minimap-mask').first()).toBeAttached()
    })
  })

  // ------------------------------------------------------------
  test.describe('Background Variants Demo', () => {
    const scope = '[bf-s^="XyflowBackgroundVariantsDemo_"]:not([data-slot])'

    test('renders three Flow containers', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('.bf-flow')).toHaveCount(3)
    })

    test('renders three <pattern> elements (one per variant)', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('pattern')).toHaveCount(3)
    })
  })

  // ------------------------------------------------------------
  test.describe('Custom Node Demo', () => {
    const scope = '[bf-s^="XyflowCustomNodeDemo_"]:not([data-slot])'

    test('renders three custom-bodied nodes', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('.bf-flow__node')).toHaveCount(3)
    })

    test('each node has both target and source handles', async ({ page }) => {
      const container = page.locator(scope)
      await expect(container.locator('.bf-flow__handle--target')).toHaveCount(3)
      await expect(container.locator('.bf-flow__handle--source')).toHaveCount(3)
    })

    test('handles expose data-node-id and data-handle-type', async ({ page }) => {
      const container = page.locator(scope)
      const handle = container.locator('.bf-flow__handle').first()
      await expect(handle).toHaveAttribute('data-node-id', /.+/)
      await expect(handle).toHaveAttribute('data-handle-type', /(source|target)/)
    })
  })

  // ------------------------------------------------------------
  // Pan / zoom / drag / connection-drag interactivity is gated on the
  // pointer-paced subsystem attach implemented in cutover step C4.
  // These describe blocks exist as placeholders so the gap between the
  // packages/xyflow imperative-era e2e suite and the new JSX-native
  // suite is visible. They MUST be re-enabled (and assertions filled
  // in) in C4 — leaving `.skip` past C4 violates the project's
  // "never leave skip when component work is done" rule.
  // ------------------------------------------------------------

  test.describe.skip('Node Dragging (re-enable in cutover step C4)', () => {
    test('drag updates node transform', async () => {
      // Filled in once the drag handler ships from @barefootjs/xyflow.
    })
  })

  test.describe.skip('Pan / Zoom (re-enable in cutover step C4)', () => {
    test('wheel zoom updates viewport scale', async () => {
      // Filled in once XYPanZoom wiring ships via the Flow ref callback.
    })
  })

  test.describe.skip('Edge Reconnection (re-enable in cutover step C4)', () => {
    test('reconnect handles update edge endpoints', async () => {
      // Filled in once the reconnect overlay wiring ships from
      // @barefootjs/xyflow.
    })
  })
})
