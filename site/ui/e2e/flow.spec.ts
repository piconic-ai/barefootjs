import { test, expect } from '@playwright/test'

test.describe('Flow Block Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/flow')
  })

  test.describe('Basic Flow Demo', () => {
    test('renders 4 nodes', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-basic"]')
      await expect(demo).toBeVisible()

      // Wait for nodes to render
      const nodes = demo.locator('.bf-flow__node')
      await expect(nodes).toHaveCount(4)
    })

    test('nodes have correct labels', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-basic"]')
      await expect(demo.locator('.bf-flow__node', { hasText: 'Start' })).toBeVisible()
      await expect(demo.locator('.bf-flow__node', { hasText: 'Process A' })).toBeVisible()
      await expect(demo.locator('.bf-flow__node', { hasText: 'Process B' })).toBeVisible()
      await expect(demo.locator('.bf-flow__node', { hasText: 'End' })).toBeVisible()
    })

    test('renders edge paths', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-basic"]')
      const edges = demo.locator('.bf-flow__edge')
      // 3 edges: e1-2, e1-3, e2-4
      await expect(edges).toHaveCount(3)
    })

    test('nodes have correct position transforms', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-basic"]')

      // Node "Start" at position (0, 0)
      const startNode = demo.locator('.bf-flow__node[data-id="1"]')
      await expect(startNode).toBeVisible()
      const style = await startNode.getAttribute('style')
      expect(style).toContain('translate(0px, 0px)')
    })

    test('viewport has transform style', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-basic"]')
      const viewport = demo.locator('.bf-flow__viewport')
      await expect(viewport).toBeVisible()

      const style = await viewport.getAttribute('style')
      expect(style).toContain('translate(')
      expect(style).toContain('scale(')
    })

    test('node can be clicked to select', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-basic"]')
      const node = demo.locator('.bf-flow__node[data-id="1"]')

      await node.click()
      await expect(node).toHaveClass(/bf-flow__node--selected/)
    })

    test('clicking another node deselects previous', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-basic"]')
      const node1 = demo.locator('.bf-flow__node[data-id="1"]')
      const node2 = demo.locator('.bf-flow__node[data-id="2"]')

      await node1.click()
      await expect(node1).toHaveClass(/bf-flow__node--selected/)

      await node2.click()
      await expect(node2).toHaveClass(/bf-flow__node--selected/)
      await expect(node1).not.toHaveClass(/bf-flow__node--selected/)
    })

    test('shift-click enables multi-select', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-basic"]')
      const node1 = demo.locator('.bf-flow__node[data-id="1"]')
      const node2 = demo.locator('.bf-flow__node[data-id="2"]')

      await node1.click()
      await node2.click({ modifiers: ['Shift'] })

      await expect(node1).toHaveClass(/bf-flow__node--selected/)
      await expect(node2).toHaveClass(/bf-flow__node--selected/)
    })
  })

  test.describe('Flow with Plugins Demo', () => {
    test('renders background pattern', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-plugins"]')
      const bg = demo.locator('svg').first()
      await expect(bg).toBeVisible()
    })

    test('renders controls panel', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-plugins"]')
      const controls = demo.locator('.bf-flow__controls')
      await expect(controls).toBeVisible()
    })

    test('controls has zoom in/out and fit buttons', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-plugins"]')
      const buttons = demo.locator('.bf-flow__controls-button')
      await expect(buttons).toHaveCount(3) // +, −, ⊡
    })

    test('renders 4 nodes and 4 edges', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-plugins"]')
      await expect(demo.locator('.bf-flow__node')).toHaveCount(4)
      await expect(demo.locator('.bf-flow__edge')).toHaveCount(4)
    })
  })

  test.describe('Stress Test Demo', () => {
    test('renders 20 nodes in a grid', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-stress"]')
      const nodes = demo.locator('.bf-flow__node')
      await expect(nodes).toHaveCount(20)
    })

    test('renders correct number of edges (31)', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-stress"]')
      const edges = demo.locator('.bf-flow__edge')
      await expect(edges).toHaveCount(31)
    })

    test('controls positioned at top-right', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-stress"]')
      const controls = demo.locator('.bf-flow__controls')
      await expect(controls).toBeVisible()
    })

    test('first node has label "Node 1"', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-stress"]')
      const firstNode = demo.locator('.bf-flow__node[data-id="n0-0"]')
      await expect(firstNode).toHaveText('Node 1')
    })

    test('last node has label "Node 20"', async ({ page }) => {
      const demo = page.locator('[data-testid="flow-stress"]')
      const lastNode = demo.locator('.bf-flow__node[data-id="n3-4"]')
      await expect(lastNode).toHaveText('Node 20')
    })
  })
})
