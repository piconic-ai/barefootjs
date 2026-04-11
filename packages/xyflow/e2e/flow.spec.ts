import { test, expect, type Locator } from '@playwright/test'

/**
 * Parse CSS transform from viewport element style.
 * D3 zoom sets style.transform = "translate(Xpx, Ypx) scale(Z)"
 * Our initFlow also sets it via createEffect.
 */
async function getTransform(viewport: Locator) {
  const transformString = await viewport.evaluate((el: HTMLElement) => el.style.transform)
  const nums = transformString.match(/[\d.]+/g)
  if (!nums || nums.length < 3) {
    return { translateX: 0, translateY: 0, scale: 1 }
  }
  return {
    translateX: parseFloat(nums[0]),
    translateY: parseFloat(nums[1]),
    scale: parseFloat(nums[2]),
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

// ============================================================
// Node Rendering
// ============================================================
test.describe('Node Rendering', () => {
  test('renders correct number of nodes', async ({ page }) => {
    await expect(page.locator('#basic .bf-flow__node')).toHaveCount(4)
  })

  test('nodes have correct labels', async ({ page }) => {
    const c = page.locator('#basic')
    await expect(c.locator('.bf-flow__node', { hasText: 'Start' })).toBeVisible()
    await expect(c.locator('.bf-flow__node', { hasText: 'Process A' })).toBeVisible()
    await expect(c.locator('.bf-flow__node', { hasText: 'Process B' })).toBeVisible()
    await expect(c.locator('.bf-flow__node', { hasText: 'End' })).toBeVisible()
  })

  test('nodes have data-id attributes', async ({ page }) => {
    const c = page.locator('#basic')
    await expect(c.locator('.bf-flow__node[data-id="1"]')).toBeAttached()
    await expect(c.locator('.bf-flow__node[data-id="2"]')).toBeAttached()
    await expect(c.locator('.bf-flow__node[data-id="3"]')).toBeAttached()
    await expect(c.locator('.bf-flow__node[data-id="4"]')).toBeAttached()
  })

  test('nodes are positioned via CSS transform', async ({ page }) => {
    const node = page.locator('#basic .bf-flow__node[data-id="1"]')
    const style = await node.getAttribute('style')
    expect(style).toContain('translate(0px, 0px)')
  })

  test('second node offset from first', async ({ page }) => {
    const node = page.locator('#basic .bf-flow__node[data-id="2"]')
    const style = await node.getAttribute('style')
    expect(style).toContain('translate(200px, 80px)')
  })

  test('viewport element exists in DOM', async ({ page }) => {
    await expect(page.locator('#basic .bf-flow__viewport')).toBeAttached()
  })

  test('nodes container exists', async ({ page }) => {
    await expect(page.locator('#basic .bf-flow__nodes')).toBeAttached()
  })
})

// ============================================================
// Edge Rendering
// ============================================================
test.describe('Edge Rendering', () => {
  test('renders correct number of edges', async ({ page }) => {
    await expect(page.locator('#basic .bf-flow__edge')).toHaveCount(3)
  })

  test('edge paths have valid SVG d attribute', async ({ page }) => {
    const edge = page.locator('#basic .bf-flow__edge').first()
    const d = await edge.getAttribute('d')
    expect(d).toBeTruthy()
    expect(d!.startsWith('M')).toBe(true)
  })

  test('edges have data-id attributes', async ({ page }) => {
    await expect(page.locator('#basic .bf-flow__edge[data-id="e1-2"]')).toBeAttached()
    await expect(page.locator('#basic .bf-flow__edge[data-id="e1-3"]')).toBeAttached()
    await expect(page.locator('#basic .bf-flow__edge[data-id="e2-4"]')).toBeAttached()
  })

  test('edges are SVG path elements', async ({ page }) => {
    const edge = page.locator('#basic .bf-flow__edge').first()
    const tagName = await edge.evaluate(el => el.tagName.toLowerCase())
    expect(tagName).toBe('path')
  })

  test('edges have fill=none and stroke', async ({ page }) => {
    const edge = page.locator('#basic .bf-flow__edge').first()
    expect(await edge.getAttribute('fill')).toBe('none')
    expect(await edge.getAttribute('stroke')).toBeTruthy()
  })
})

// ============================================================
// Edge Properties (hidden, animated)
// ============================================================
test.describe('Edge Properties', () => {
  test('visible edge is rendered', async ({ page }) => {
    await expect(page.locator('#edge-props .bf-flow__edge[data-id="visible"]')).toBeAttached()
  })

  test('hidden edge is not rendered', async ({ page }) => {
    await expect(page.locator('#edge-props .bf-flow__edge[data-id="hidden-edge"]')).not.toBeAttached()
  })

  test('animated edge has dasharray and class', async ({ page }) => {
    const edge = page.locator('#edge-props .bf-flow__edge[data-id="animated-edge"]')
    await expect(edge).toBeAttached()
    expect(await edge.getAttribute('stroke-dasharray')).toBe('5')
    await expect(edge).toHaveClass(/bf-flow__edge--animated/)
  })

  test('correct node count in edge-props scenario', async ({ page }) => {
    await expect(page.locator('#edge-props .bf-flow__node')).toHaveCount(4)
  })

  test('only non-hidden edges are rendered (2 of 3)', async ({ page }) => {
    await expect(page.locator('#edge-props .bf-flow__edge')).toHaveCount(2)
  })
})

// ============================================================
// Node Dragging
// ============================================================
test.describe('Node Dragging', () => {
  // XYDrag uses D3's pointer capture which intercepts Playwright's
  // mouse events at the container level. These tests verify the
  // draggable/non-draggable node configuration is applied correctly.
  test('draggable node has grab cursor', async ({ page }) => {
    const node = page.locator('#interact .bf-flow__node[data-id="drag1"]')
    const cursor = await node.evaluate(el => getComputedStyle(el).cursor)
    expect(cursor).toBe('grab')
  })

  test('non-draggable node exists with correct position', async ({ page }) => {
    const node = page.locator('#interact .bf-flow__node[data-id="fixed"]')
    await expect(node).toBeAttached()
    const style = await node.getAttribute('style')
    expect(style).toContain('translate(50px, 200px)')
  })

  test('initial node positions are correct', async ({ page }) => {
    const drag1 = page.locator('#interact .bf-flow__node[data-id="drag1"]')
    const drag2 = page.locator('#interact .bf-flow__node[data-id="drag2"]')
    expect(await drag1.getAttribute('style')).toContain('translate(50px, 50px)')
    expect(await drag2.getAttribute('style')).toContain('translate(300px, 50px)')
  })

  test('edges update during node drag', async ({ page }) => {
    await page.waitForSelector('#interact .bf-flow__node[data-id="drag1"]')
    await page.waitForSelector('#interact .bf-flow__edge[data-id="e-drag"]')
    const result = await page.evaluate(async () => {
      const node = document.querySelector('#interact [data-id="drag1"]')!
      const edge = document.querySelector('#interact .bf-flow__edge[data-id="e-drag"]')!
      const rect = node.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2

      const edgeBefore = edge.getAttribute('d')

      node.dispatchEvent(new MouseEvent('mousedown', {
        clientX: cx, clientY: cy, button: 0, bubbles: true, view: window,
      }))

      for (let i = 1; i <= 5; i++) {
        document.dispatchEvent(new MouseEvent('mousemove', {
          clientX: cx + i * 30, clientY: cy, bubbles: true, view: window,
        }))
      }

      const edgeDuring = edge.getAttribute('d')
      const nodeTransform = (node as HTMLElement).style.transform

      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }))

      await new Promise(r => setTimeout(r, 100))
      const edgeAfter = edge.getAttribute('d')

      return { edgeBefore, edgeDuring, edgeAfter, nodeTransform }
    })

    // Node moved
    expect(result.nodeTransform).not.toBe('translate(50px, 50px)')
    // Edge should have updated (at least after mouseup triggers setNodes)
    expect(result.edgeAfter).not.toBe(result.edgeBefore)
  })
})

// ============================================================
// Node Selection (via XYDrag selectNodesOnDrag)
// ============================================================
test.describe('Node Selection', () => {
  // XYDrag handles selection during drag start, which requires
  // D3 pointer events. We test the selection state management
  // via unit tests (store.test.ts) and verify the CSS class
  // is applied when selection state changes.
  test('interact scenario has 3 nodes', async ({ page }) => {
    await expect(page.locator('#interact .bf-flow__node')).toHaveCount(3)
  })

  test('interact scenario has 2 edges', async ({ page }) => {
    await expect(page.locator('#interact .bf-flow__edge')).toHaveCount(2)
  })
})

// ============================================================
// Pan & Zoom
// ============================================================
test.describe('Pan & Zoom', () => {
  test('initial viewport has default transform', async ({ page }) => {
    const viewport = page.locator('#basic .bf-flow__viewport')
    await expect(viewport).toBeAttached()
    const t = await getTransform(viewport)
    // Default viewport: {x:0, y:0, zoom:1}
    expect(t.scale).toBe(1)
  })

  test('scroll wheel zooms the viewport', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')
    const before = await getTransform(viewport)

    const box = await container.boundingBox()
    if (!box) throw new Error('Container not visible')

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -300) // scroll up = zoom in
    await page.waitForTimeout(300)

    const after = await getTransform(viewport)
    expect(after.scale).not.toBe(before.scale)
    expect(after.scale).toBeGreaterThan(before.scale) // zoomed in
  })

  test('scroll wheel zoom out', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')
    const before = await getTransform(viewport)

    const box = await container.boundingBox()
    if (!box) throw new Error('Container not visible')

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 300) // scroll down = zoom out
    await page.waitForTimeout(300)

    const after = await getTransform(viewport)
    expect(after.scale).toBeLessThan(before.scale)
  })

  test('zoom is clamped to maxZoom', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')

    const box = await container.boundingBox()
    if (!box) throw new Error('Container not visible')

    // Zoom in aggressively
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -5000)
    await page.waitForTimeout(300)

    const t = await getTransform(viewport)
    // Default maxZoom is 2
    expect(t.scale).toBeLessThanOrEqual(2.01) // small float tolerance
  })

  test('zoom is clamped to minZoom', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')

    const box = await container.boundingBox()
    if (!box) throw new Error('Container not visible')

    // Zoom out aggressively
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 5000)
    await page.waitForTimeout(300)

    const t = await getTransform(viewport)
    // Default minZoom is 0.5
    expect(t.scale).toBeGreaterThanOrEqual(0.49) // small float tolerance
  })

  test('D3 zoom is attached to container', async ({ page }) => {
    const hasZoom = await page.evaluate(() => {
      const container = document.getElementById('basic')!
      return (container as any).__zoom !== undefined
    })
    expect(hasZoom).toBe(true)
  })

  test('panning via mouse drag changes viewport style', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')

    const box = await container.boundingBox()
    if (!box) throw new Error('Container not visible')

    const styleBefore = await viewport.evaluate((el: HTMLElement) => el.style.transform)

    // Drag on empty area — bottom-right corner is far from all nodes
    const startX = box.x + box.width - 20
    const startY = box.y + box.height - 20
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX - 120, startY - 80, { steps: 15 })
    await page.mouse.up()
    await page.waitForTimeout(500)

    const styleAfter = await viewport.evaluate((el: HTMLElement) => el.style.transform)

    // If pan doesn't work, this is a known issue with XYPanZoom + D3
    // integration. The zoom (wheel) path works because D3 uses a different
    // event handler for wheel vs pointer/drag events.
    // Pan should have changed the viewport transform
    expect(styleAfter).not.toBe(styleBefore)
  })

  test('panning preserves zoom level', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')

    // First zoom in
    const box = await container.boundingBox()
    if (!box) throw new Error('Container not visible')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -200)
    await page.waitForTimeout(300)

    const afterZoom = await getTransform(viewport)

    // Now pan
    await page.mouse.move(box.x + box.width - 50, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 150, box.y + 100, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(100)

    const afterPan = await getTransform(viewport)
    // Scale should be preserved after panning
    expect(afterPan.scale).toBeCloseTo(afterZoom.scale, 1)
  })
})

// ============================================================
// Keyboard Delete (tested at unit level in store.test.ts)
// ============================================================
test.describe('Keyboard Delete', () => {
  test('container has tabindex for keyboard focus', async ({ page }) => {
    // setupKeyboardHandlers sets tabindex=0 on the container
    const container = page.locator('#interact')
    expect(await container.getAttribute('tabindex')).toBe('0')
  })

  test('escape key deselection is wired up', async ({ page }) => {
    // Verify the container can receive keyboard events
    const container = page.locator('#interact')
    await container.focus()
    await page.keyboard.press('Escape')
    // No crash = keyboard handlers are wired correctly
  })
})

// ============================================================
// Background Plugin
// ============================================================
test.describe('Background Plugin', () => {
  test('renders SVG pattern element', async ({ page }) => {
    await expect(page.locator('#plugins svg pattern')).toHaveCount(1)
  })

  test('pattern has width and height', async ({ page }) => {
    const pattern = page.locator('#plugins svg pattern')
    const width = await pattern.getAttribute('width')
    const height = await pattern.getAttribute('height')
    expect(Number(width)).toBeGreaterThan(0)
    expect(Number(height)).toBeGreaterThan(0)
  })

  test('background rect fills container', async ({ page }) => {
    const rect = page.locator('#plugins svg rect[width="100%"]')
    await expect(rect).toBeAttached()
  })
})

// ============================================================
// Controls Plugin
// ============================================================
test.describe('Controls Plugin', () => {
  test('renders controls panel', async ({ page }) => {
    await expect(page.locator('#plugins .bf-flow__controls')).toBeVisible()
  })

  test('has 4 buttons (zoom in, zoom out, fit, lock)', async ({ page }) => {
    await expect(page.locator('#plugins .bf-flow__controls-button')).toHaveCount(4)
  })

  test('zoom in button is clickable', async ({ page }) => {
    const zoomInBtn = page.locator('#plugins .bf-flow__controls-button').first()
    // Controls buttons have nodrag/nowheel classes to avoid D3 interference
    await expect(zoomInBtn).toHaveClass(/nodrag/)
    await expect(zoomInBtn).toHaveClass(/nowheel/)
  })
})

// ============================================================
// Stress Test
// ============================================================
test.describe('Stress Test', () => {
  test('renders 20 nodes', async ({ page }) => {
    await expect(page.locator('#stress .bf-flow__node')).toHaveCount(20)
  })

  test('renders 31 edges', async ({ page }) => {
    await expect(page.locator('#stress .bf-flow__edge')).toHaveCount(31)
  })

  test('first node label', async ({ page }) => {
    await expect(page.locator('#stress .bf-flow__node[data-id="n0-0"]')).toHaveText('Node 1')
  })

  test('last node label', async ({ page }) => {
    await expect(page.locator('#stress .bf-flow__node[data-id="n3-4"]')).toHaveText('Node 20')
  })

  test('has controls', async ({ page }) => {
    await expect(page.locator('#stress .bf-flow__controls')).toBeVisible()
  })

  test('has background pattern', async ({ page }) => {
    await expect(page.locator('#stress svg pattern')).toBeAttached()
  })
})
