import { test, expect } from '@playwright/test'

test.describe('Graph Editor Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/graph-editor')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="GraphEditorDemo_"]:not([data-slot])').first()

  // --- Initial Render ---

  test.describe('Initial Render', () => {
    test('renders canvas with five preset nodes', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('[data-graph-canvas]')).toBeVisible()
      await expect(s.locator('[data-node-id]')).toHaveCount(5)
      await expect(s.locator('[data-node-id="n1"]')).toBeVisible()
      await expect(s.locator('[data-node-id="n5"]')).toBeVisible()
    })

    test('renders five preset edges with d attributes', async ({ page }) => {
      const s = section(page)
      const edges = s.locator('[data-edge-id]')
      await expect(edges).toHaveCount(5)
      // Every edge has a non-empty `d` cubic bezier path
      for (let i = 0; i < 5; i++) {
        const d = await edges.nth(i).getAttribute('d')
        expect(d).toMatch(/^M\s+\d+\s+\d+\s+C\s/)
      }
    })

    test('node count and edge count badges show 5 / 5', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.node-count')).toHaveText('5 nodes')
      await expect(s.locator('.edge-count')).toHaveText('5 edges')
    })

    test('initial viewBox is the full canvas', async ({ page }) => {
      const s = section(page)
      const vb = await s.locator('[data-graph-canvas]').getAttribute('viewBox')
      expect(vb).toBe('0 0 720 400')
    })

    test('zoom label starts at 100%', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.zoom-label')).toHaveText('100%')
    })

    test('delete-edge button is disabled when no edge selected', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.delete-edge-btn')).toBeDisabled()
    })
  })

  // --- Reactive viewBox ---

  test.describe('Reactive viewBox (zoom)', () => {
    test('zoom in shrinks viewBox dimensions', async ({ page }) => {
      const s = section(page)
      await s.locator('.zoom-in-btn').click()
      const vb = await s.locator('[data-graph-canvas]').getAttribute('viewBox')
      // 1.1x zoom: 720/1.1 ≈ 654, 400/1.1 ≈ 363
      expect(vb).not.toBe('0 0 720 400')
      const parts = vb!.split(/\s+/).map(Number)
      expect(parts[2]).toBeLessThan(720)
      expect(parts[3]).toBeLessThan(400)
      await expect(s.locator('.zoom-label')).toHaveText('110%')
    })

    test('zoom out grows viewBox dimensions', async ({ page }) => {
      const s = section(page)
      await s.locator('.zoom-out-btn').click()
      const vb = await s.locator('[data-graph-canvas]').getAttribute('viewBox')
      const parts = vb!.split(/\s+/).map(Number)
      expect(parts[2]).toBeGreaterThan(720)
      expect(parts[3]).toBeGreaterThan(400)
      await expect(s.locator('.zoom-label')).toHaveText('90%')
    })
  })

  // --- Reactive cx/cy on node drag ---

  test.describe('Node drag updates cx/cy', () => {
    test('dragging n1 updates its <circle> cx/cy', async ({ page }) => {
      const s = section(page)
      const node = s.locator('[data-node-id="n1"]')
      const body = node.locator('.graph-node-body')

      const cxBefore = await body.getAttribute('cx')
      const cyBefore = await body.getAttribute('cy')
      expect(cxBefore).toBe('80')
      expect(cyBefore).toBe('100')

      const canvas = s.locator('[data-graph-canvas]')
      const canvasBox = await canvas.boundingBox()
      const nodeBox = await node.boundingBox()
      if (!canvasBox || !nodeBox) throw new Error('bounding box missing')

      const startX = nodeBox.x + nodeBox.width / 2
      const startY = nodeBox.y + nodeBox.height / 2
      const endX = startX + 60
      const endY = startY + 40

      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(endX, endY, { steps: 5 })
      await page.mouse.up()

      const cxAfter = await body.getAttribute('cx')
      const cyAfter = await body.getAttribute('cy')
      expect(Number(cxAfter)).toBeGreaterThan(Number(cxBefore))
      expect(Number(cyAfter)).toBeGreaterThan(Number(cyBefore))
    })

    test('dragging n1 rebuilds connected edges\' d strings', async ({ page }) => {
      const s = section(page)
      const node = s.locator('[data-node-id="n1"]')
      const e1 = s.locator('[data-edge-id="e1"]')

      const dBefore = await e1.getAttribute('d')

      const nodeBox = await node.boundingBox()
      if (!nodeBox) throw new Error('bounding box missing')
      const startX = nodeBox.x + nodeBox.width / 2
      const startY = nodeBox.y + nodeBox.height / 2

      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(startX + 80, startY + 40, { steps: 5 })
      await page.mouse.up()

      const dAfter = await e1.getAttribute('d')
      expect(dAfter).not.toBe(dBefore)
      expect(dAfter).toMatch(/^M\s+\d+\s+\d+\s+C\s/)
    })

    test('node label <text> x/y track the body', async ({ page }) => {
      const s = section(page)
      const node = s.locator('[data-node-id="n1"]')
      const label = node.locator('.graph-node-label')

      const xBefore = await label.getAttribute('x')

      const nodeBox = await node.boundingBox()
      if (!nodeBox) throw new Error('bounding box missing')
      const startX = nodeBox.x + nodeBox.width / 2
      const startY = nodeBox.y + nodeBox.height / 2

      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(startX + 50, startY, { steps: 5 })
      await page.mouse.up()

      const xAfter = await label.getAttribute('x')
      expect(Number(xAfter)).toBeGreaterThan(Number(xBefore))
    })
  })

  // --- Auto layout swap ---

  test.describe('Auto layout', () => {
    test('toggling auto-layout repositions every node simultaneously', async ({ page }) => {
      const s = section(page)
      const before: Record<string, string | null> = {}
      const ids = ['n1', 'n2', 'n3', 'n4', 'n5']
      for (const id of ids) {
        before[id] = await s.locator(`[data-node-id="${id}"] .graph-node-body`).getAttribute('cx')
      }

      await s.locator('.auto-layout-toggle').check()

      let movedCount = 0
      for (const id of ids) {
        const after = await s.locator(`[data-node-id="${id}"] .graph-node-body`).getAttribute('cx')
        if (after !== before[id]) movedCount++
      }
      expect(movedCount).toBeGreaterThanOrEqual(3)
    })

    test('auto-layout disables manual drag', async ({ page }) => {
      const s = section(page)
      await s.locator('.auto-layout-toggle').check()

      const node = s.locator('[data-node-id="n1"]')
      const body = node.locator('.graph-node-body')
      const cxBefore = await body.getAttribute('cx')

      const nodeBox = await node.boundingBox()
      if (!nodeBox) throw new Error('bounding box missing')
      await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(nodeBox.x + nodeBox.width / 2 + 80, nodeBox.y + nodeBox.height / 2)
      await page.mouse.up()

      const cxAfter = await body.getAttribute('cx')
      expect(cxAfter).toBe(cxBefore)
    })
  })

  // --- Edge selection / deletion ---

  test.describe('Edge selection', () => {
    test('clicking an edge selects it and enables delete button', async ({ page }) => {
      const s = section(page)
      const e1 = s.locator('[data-edge-id="e1"]')
      await e1.click()
      await expect(e1).toHaveClass(/graph-edge-selected/)
      await expect(s.locator('.delete-edge-btn')).toBeEnabled()
    })

    test('delete removes the selected edge from the loop', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-edge-id="e1"]').click()
      await s.locator('.delete-edge-btn').click()

      await expect(s.locator('[data-edge-id]')).toHaveCount(4)
      await expect(s.locator('[data-edge-id="e1"]')).toHaveCount(0)
      await expect(s.locator('.edge-count')).toHaveText('4 edges')
    })
  })

  // --- Edge creation by drag-to-connect ---

  test.describe('Edge connect', () => {
    test('dragging from a node handle to another node creates a new edge', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('[data-edge-id]')).toHaveCount(5)

      // n1's handle (right side of the source node) → n5 (the sink node).
      // No edge from n1 to n5 exists initially.
      const handle = s.locator('[data-node-handle-id="n1"]').first()
      const target = s.locator('[data-node-id="n5"]').first()

      const hb = await handle.boundingBox()
      const tb = await target.boundingBox()
      if (!hb || !tb) throw new Error('bounding box missing')

      const sx = hb.x + hb.width / 2
      const sy = hb.y + hb.height / 2
      const ex = tb.x + tb.width / 2
      const ey = tb.y + tb.height / 2

      const preview = s.locator('[data-connect-preview]')

      await page.mouse.move(sx, sy)
      await page.mouse.down()
      // Step through so the connect-preview path renders along the way.
      await page.mouse.move((sx + ex) / 2, (sy + ey) / 2, { steps: 5 })
      // While dragging, the preview path is mounted via the conditional.
      await expect(preview).toHaveCount(1)
      await page.mouse.move(ex, ey, { steps: 5 })
      await page.mouse.up()

      await expect(s.locator('[data-edge-id]')).toHaveCount(6)
      await expect(s.locator('.edge-count')).toHaveText('6 edges')
      // The connect preview is unmounted once drag ends.
      await expect(preview).toHaveCount(0)
    })

    test('drag-to-connect onto the source node itself does not create a self-edge', async ({ page }) => {
      const s = section(page)
      const handle = s.locator('[data-node-handle-id="n1"]').first()
      const sourceBody = s.locator('[data-node-id="n1"] .graph-node-body').first()

      const hb = await handle.boundingBox()
      const sb = await sourceBody.boundingBox()
      if (!hb || !sb) throw new Error('bounding box missing')

      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
      await page.mouse.down()
      await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 5 })
      await page.mouse.up()

      await expect(s.locator('[data-edge-id]')).toHaveCount(5)
    })

    test('drag-to-connect onto an existing target does not create a duplicate edge', async ({ page }) => {
      const s = section(page)
      // n1 → n2 already exists (e1).
      const handle = s.locator('[data-node-handle-id="n1"]').first()
      const target = s.locator('[data-node-id="n2"]').first()

      const hb = await handle.boundingBox()
      const tb = await target.boundingBox()
      if (!hb || !tb) throw new Error('bounding box missing')

      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
      await page.mouse.down()
      await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 5 })
      await page.mouse.up()

      await expect(s.locator('[data-edge-id]')).toHaveCount(5)
    })
  })

  // --- Reset ---

  test.describe('Reset', () => {
    test('reset restores initial nodes, edges, zoom, and auto-layout', async ({ page }) => {
      const s = section(page)
      await s.locator('.zoom-in-btn').click()
      await s.locator('[data-edge-id="e1"]').click()
      await s.locator('.delete-edge-btn').click()

      await s.locator('.reset-btn').click()

      await expect(s.locator('[data-node-id]')).toHaveCount(5)
      await expect(s.locator('[data-edge-id]')).toHaveCount(5)
      await expect(s.locator('.zoom-label')).toHaveText('100%')
      const cx = await s.locator('[data-node-id="n1"] .graph-node-body').getAttribute('cx')
      expect(cx).toBe('80')
    })
  })
})
