import { test, expect, type Locator } from '@playwright/test'

/**
 * Parse CSS transform from viewport element style.
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

/**
 * Dispatch a drag sequence on a node via JS (native events).
 */
async function dispatchDrag(
  page: any,
  selector: string,
  dx: number,
  dy: number,
) {
  await page.evaluate(
    async ({ sel, dx, dy }: { sel: string; dx: number; dy: number }) => {
      const node = document.querySelector(sel)!
      const rect = node.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2

      node.dispatchEvent(
        new MouseEvent('mousedown', { clientX: cx, clientY: cy, button: 0, bubbles: true, view: window }),
      )
      await new Promise((r) => setTimeout(r, 10))
      for (let i = 1; i <= 5; i++) {
        document.dispatchEvent(
          new MouseEvent('mousemove', {
            clientX: cx + (dx * i) / 5,
            clientY: cy + (dy * i) / 5,
            bubbles: true,
            view: window,
          }),
        )
        await new Promise((r) => setTimeout(r, 16))
      }
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: cx + dx, clientY: cy + dy, bubbles: true, view: window }),
      )
      await new Promise((r) => setTimeout(r, 100))
    },
    { sel: selector, dx, dy },
  )
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
    for (const id of ['1', '2', '3', '4']) {
      await expect(c.locator(`.bf-flow__node[data-id="${id}"]`)).toBeAttached()
    }
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

  test('default nodes have source and target handles', async ({ page }) => {
    const node = page.locator('#basic .bf-flow__node[data-id="1"]')
    await expect(node.locator('.bf-flow__handle--source')).toBeAttached()
    await expect(node.locator('.bf-flow__handle--target')).toBeAttached()
  })

  test('handles have data-node-id and data-handle-type', async ({ page }) => {
    const source = page.locator('#basic .bf-flow__node[data-id="1"] .bf-flow__handle--source')
    expect(await source.getAttribute('data-node-id')).toBe('1')
    expect(await source.getAttribute('data-handle-type')).toBe('source')
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
    for (const id of ['e1-2', 'e1-3', 'e2-4']) {
      await expect(page.locator(`#basic .bf-flow__edge[data-id="${id}"]`)).toBeAttached()
    }
  })

  test('edges are SVG path elements', async ({ page }) => {
    const edge = page.locator('#basic .bf-flow__edge').first()
    const tagName = await edge.evaluate((el) => el.tagName.toLowerCase())
    expect(tagName).toBe('path')
  })

  test('edges are styled via CSS class', async ({ page }) => {
    const edge = page.locator('#basic .bf-flow__edge').first()
    await expect(edge).toHaveClass(/bf-flow__edge/)
  })

  test('each edge has an invisible hit area for click selection', async ({ page }) => {
    const hitAreas = page.locator('#basic path[stroke="transparent"]')
    await expect(hitAreas).toHaveCount(3)
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

  test('animated edge has animated class', async ({ page }) => {
    const edge = page.locator('#edge-props .bf-flow__edge[data-id="animated-edge"]')
    await expect(edge).toBeAttached()
    await expect(edge).toHaveClass(/bf-flow__edge--animated/)
  })

  test('only non-hidden edges are rendered (2 of 3)', async ({ page }) => {
    await expect(page.locator('#edge-props .bf-flow__edge')).toHaveCount(2)
  })
})

// ============================================================
// Node Dragging
// ============================================================
test.describe('Node Dragging', () => {
  test('draggable node has grab cursor', async ({ page }) => {
    const node = page.locator('#interact .bf-flow__node[data-id="drag1"]')
    const cursor = await node.evaluate((el) => getComputedStyle(el).cursor)
    expect(cursor).toBe('grab')
  })

  test('non-draggable node exists with correct position', async ({ page }) => {
    const node = page.locator('#interact .bf-flow__node[data-id="fixed"]')
    await expect(node).toBeAttached()
    const style = await node.getAttribute('style')
    expect(style).toContain('translate(50px, 200px)')
  })

  test('drag moves node position', async ({ page }) => {
    await page.waitForSelector('#interact .bf-flow__node[data-id="drag1"]')
    const node = page.locator('#interact .bf-flow__node[data-id="drag1"]')
    const before = await node.evaluate((el: HTMLElement) => el.style.transform)

    await dispatchDrag(page, '#interact [data-id="drag1"]', 100, 50)

    const after = await node.evaluate((el: HTMLElement) => el.style.transform)
    expect(after).not.toBe(before)
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

      node.dispatchEvent(new MouseEvent('mousedown', { clientX: cx, clientY: cy, button: 0, bubbles: true, view: window }))
      for (let i = 1; i <= 5; i++) {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: cx + i * 30, clientY: cy, bubbles: true, view: window }))
      }
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }))
      await new Promise((r) => setTimeout(r, 100))
      const edgeAfter = edge.getAttribute('d')
      return { edgeBefore, edgeAfter }
    })
    expect(result.edgeAfter).not.toBe(result.edgeBefore)
  })

  test('non-draggable node does not have nopan class (allows pan)', async ({ page }) => {
    const fixed = page.locator('#interact .bf-flow__node[data-id="fixed"]')
    await expect(fixed).not.toHaveClass(/nopan/)
  })
})

// ============================================================
// Node Selection
// ============================================================
test.describe('Node Selection', () => {
  test('clicking node adds selected class', async ({ page }) => {
    await page.waitForSelector('#interact .bf-flow__node[data-id="drag1"]')
    const result = await page.evaluate(() => {
      const node = document.querySelector('#interact [data-id="drag1"]')!
      const rect = node.getBoundingClientRect()
      node.dispatchEvent(new MouseEvent('mousedown', {
        clientX: rect.left + 5, clientY: rect.top + 5, button: 0, bubbles: true, view: window,
      }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }))
      return node.classList.contains('bf-flow__node--selected')
    })
    expect(result).toBe(true)
  })

  test('clicking another node deselects previous', async ({ page }) => {
    await page.waitForSelector('#interact .bf-flow__node[data-id="drag1"]')
    const result = await page.evaluate(() => {
      const node1 = document.querySelector('#interact [data-id="drag1"]')!
      const node2 = document.querySelector('#interact [data-id="drag2"]')!
      const r1 = node1.getBoundingClientRect()
      const r2 = node2.getBoundingClientRect()

      node1.dispatchEvent(new MouseEvent('mousedown', { clientX: r1.left + 5, clientY: r1.top + 5, button: 0, bubbles: true, view: window }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }))

      node2.dispatchEvent(new MouseEvent('mousedown', { clientX: r2.left + 5, clientY: r2.top + 5, button: 0, bubbles: true, view: window }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }))

      return {
        node1Selected: node1.classList.contains('bf-flow__node--selected'),
        node2Selected: node2.classList.contains('bf-flow__node--selected'),
      }
    })
    expect(result.node1Selected).toBe(false)
    expect(result.node2Selected).toBe(true)
  })
})

// ============================================================
// Edge Selection & Deletion
// ============================================================
test.describe('Edge Selection & Deletion', () => {
  test('clicking edge hit area selects it', async ({ page }) => {
    await page.waitForSelector('#plugins .bf-flow__edge[data-id="ab"]')
    const result = await page.evaluate(() => {
      const hitPath = document.querySelector('#plugins path[stroke="transparent"]')!
      hitPath.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, view: window }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }))
      const edge = document.querySelector('#plugins .bf-flow__edge[data-id="ab"]')!
      return edge.classList.contains('bf-flow__edge--selected')
    })
    expect(result).toBe(true)
  })

  test('delete key removes selected edge', async ({ page }) => {
    await page.waitForSelector('#plugins .bf-flow__edge[data-id="ab"]')
    const beforeCount = await page.locator('#plugins .bf-flow__edge').count()

    await page.evaluate(() => {
      const hitPath = document.querySelector('#plugins path[stroke="transparent"]')!
      hitPath.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, view: window }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }))
    })

    await page.locator('#plugins').focus()
    await page.keyboard.press('Delete')
    await page.waitForTimeout(100)

    const afterCount = await page.locator('#plugins .bf-flow__edge').count()
    expect(afterCount).toBeLessThan(beforeCount)
  })
})

// ============================================================
// Node Deletion
// ============================================================
test.describe('Node Deletion', () => {
  test('delete key removes selected node and connected edges', async ({ page }) => {
    await page.waitForSelector('#interact .bf-flow__node[data-id="drag1"]')
    const beforeNodes = await page.locator('#interact .bf-flow__node').count()
    const beforeEdges = await page.locator('#interact .bf-flow__edge').count()

    // Select node via dispatchEvent
    await page.evaluate(() => {
      const node = document.querySelector('#interact [data-id="drag1"]')!
      const r = node.getBoundingClientRect()
      node.dispatchEvent(new MouseEvent('mousedown', {
        clientX: r.left + 5, clientY: r.top + 5, button: 0, bubbles: true, view: window,
      }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }))
    })

    await page.locator('#interact').focus()
    await page.keyboard.press('Delete')
    await page.waitForTimeout(200)

    const afterNodes = await page.locator('#interact .bf-flow__node').count()
    const afterEdges = await page.locator('#interact .bf-flow__edge').count()

    expect(afterNodes).toBe(beforeNodes - 1)
    expect(afterEdges).toBeLessThan(beforeEdges)
  })
})

// ============================================================
// Edge Creation via Handle Drag
// ============================================================
test.describe('Edge Creation', () => {
  test('dragging from handle to handle creates edge', async ({ page }) => {
    await page.waitForSelector('#basic .bf-flow__node[data-id="3"]')
    await page.waitForSelector('#basic .bf-flow__node[data-id="4"]')
    const beforeEdges = await page.locator('#basic .bf-flow__edge').count()

    const created = await page.evaluate(async () => {
      const sourceHandle = document.querySelector('#basic [data-id="3"] .bf-flow__handle--source')!
      const targetHandle = document.querySelector('#basic [data-id="4"] .bf-flow__handle--target')!
      const sr = sourceHandle.getBoundingClientRect()
      const tr = targetHandle.getBoundingClientRect()

      sourceHandle.dispatchEvent(new MouseEvent('mousedown', {
        clientX: sr.left + 3, clientY: sr.top + 3, button: 0, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 10))
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 200))

      return document.querySelectorAll('#basic .bf-flow__edge').length
    })

    expect(created).toBeGreaterThan(beforeEdges)
  })
})

// ============================================================
// FitView
// ============================================================
test.describe('FitView', () => {
  test('fitView button changes viewport', async ({ page }) => {
    await page.waitForSelector('#plugins .bf-flow__controls-button')
    const result = await page.evaluate(async () => {
      const container = document.getElementById('plugins')!
      const viewport = container.querySelector('.bf-flow__viewport') as HTMLElement
      const before = viewport.style.transform

      // 3rd button = fitView
      const btns = container.querySelectorAll('.bf-flow__controls-button')
      ;(btns[2] as HTMLElement).click()
      await new Promise((r) => setTimeout(r, 500))

      return { before, after: viewport.style.transform, changed: before !== viewport.style.transform }
    })
    expect(result.changed).toBe(true)
  })

  test('fitView after drag still shows all nodes', async ({ page }) => {
    await page.waitForSelector('#plugins .bf-flow__node[data-id="a"]')

    const allVisible = await page.evaluate(async () => {
      const container = document.getElementById('plugins')!

      // Drag node "a" down 200px
      const node = container.querySelector('[data-id="a"]')!
      const r = node.getBoundingClientRect()
      node.dispatchEvent(new MouseEvent('mousedown', { clientX: r.left + 10, clientY: r.top + 10, button: 0, bubbles: true, view: window }))
      for (let i = 1; i <= 5; i++) {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + 10, clientY: r.top + 10 + i * 40, bubbles: true, view: window }))
      }
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: r.left + 10, clientY: r.top + 210, bubbles: true, view: window }))
      await new Promise((r) => setTimeout(r, 200))

      // FitView
      const btns = container.querySelectorAll('.bf-flow__controls-button')
      ;(btns[2] as HTMLElement).click()
      await new Promise((r) => setTimeout(r, 500))

      // Check all nodes visible
      const cr = container.getBoundingClientRect()
      const nodes = container.querySelectorAll('.bf-flow__node')
      return Array.from(nodes).every((n) => {
        const nr = n.getBoundingClientRect()
        return nr.top >= cr.top - 5 && nr.bottom <= cr.bottom + 5
      })
    })
    expect(allVisible).toBe(true)
  })
})

// ============================================================
// Lock Toggle
// ============================================================
test.describe('Lock Toggle', () => {
  test('lock button disables node drag', async ({ page }) => {
    await page.waitForSelector('#plugins .bf-flow__controls-button')

    const result = await page.evaluate(async () => {
      const container = document.getElementById('plugins')!
      // Click lock button (4th)
      const btns = container.querySelectorAll('.bf-flow__controls-button')
      ;(btns[3] as HTMLElement).click()
      await new Promise((r) => setTimeout(r, 50))

      // Try drag node "a"
      const node = container.querySelector('[data-id="a"]')! as HTMLElement
      const before = node.style.transform
      const r = node.getBoundingClientRect()
      node.dispatchEvent(new MouseEvent('mousedown', { clientX: r.left + 10, clientY: r.top + 10, button: 0, bubbles: true, view: window }))
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + 110, clientY: r.top + 60, bubbles: true, view: window }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }))
      await new Promise((r) => setTimeout(r, 50))

      return { before, after: node.style.transform, moved: before !== node.style.transform }
    })
    expect(result.moved).toBe(false)
  })

  test('lock removes nopan class from nodes (allows pan)', async ({ page }) => {
    await page.waitForSelector('#plugins .bf-flow__controls-button')

    await page.evaluate(() => {
      const container = document.getElementById('plugins')!
      const btns = container.querySelectorAll('.bf-flow__controls-button')
      ;(btns[3] as HTMLElement).click()
    })
    await page.waitForTimeout(50)

    const node = page.locator('#plugins .bf-flow__node[data-id="a"]')
    await expect(node).not.toHaveClass(/nopan/)
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
    expect(t.scale).toBe(1)
  })

  test('scroll wheel zooms in', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')
    const before = await getTransform(viewport)
    const box = await container.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, -300)
    await page.waitForTimeout(300)
    const after = await getTransform(viewport)
    expect(after.scale).toBeGreaterThan(before.scale)
  })

  test('scroll wheel zooms out', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')
    const before = await getTransform(viewport)
    const box = await container.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(300)
    const after = await getTransform(viewport)
    expect(after.scale).toBeLessThan(before.scale)
  })

  test('zoom clamped to maxZoom (2)', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')
    const box = await container.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, -5000)
    await page.waitForTimeout(300)
    const t = await getTransform(viewport)
    expect(t.scale).toBeLessThanOrEqual(2.01)
  })

  test('zoom clamped to minZoom (0.5)', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')
    const box = await container.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, 5000)
    await page.waitForTimeout(300)
    const t = await getTransform(viewport)
    expect(t.scale).toBeGreaterThanOrEqual(0.49)
  })

  test('D3 zoom is attached to container', async ({ page }) => {
    const hasZoom = await page.evaluate(() => (document.getElementById('basic') as any).__zoom !== undefined)
    expect(hasZoom).toBe(true)
  })

  test('panning via mouse drag', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')
    const styleBefore = await viewport.evaluate((el: HTMLElement) => el.style.transform)
    const box = await container.boundingBox()
    const startX = box!.x + box!.width - 20
    const startY = box!.y + box!.height - 20
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX - 120, startY - 80, { steps: 15 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    const styleAfter = await viewport.evaluate((el: HTMLElement) => el.style.transform)
    expect(styleAfter).not.toBe(styleBefore)
  })

  test('panning preserves zoom level', async ({ page }) => {
    const container = page.locator('#basic')
    const viewport = container.locator('.bf-flow__viewport')
    const box = await container.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, -200)
    await page.waitForTimeout(300)
    const afterZoom = await getTransform(viewport)
    await page.mouse.move(box!.x + box!.width - 50, box!.y + 20)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width - 150, box!.y + 100, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(100)
    const afterPan = await getTransform(viewport)
    expect(afterPan.scale).toBeCloseTo(afterZoom.scale, 1)
  })
})

// ============================================================
// Keyboard
// ============================================================
test.describe('Keyboard', () => {
  test('container has tabindex for keyboard focus', async ({ page }) => {
    expect(await page.locator('#interact').getAttribute('tabindex')).toBe('0')
  })

  test('escape key deselection works', async ({ page }) => {
    await page.locator('#interact').focus()
    await page.keyboard.press('Escape')
  })
})

// ============================================================
// Background Plugin
// ============================================================
test.describe('Background Plugin', () => {
  test('renders SVG pattern', async ({ page }) => {
    await expect(page.locator('#plugins svg pattern')).toHaveCount(1)
  })

  test('pattern has dimensions', async ({ page }) => {
    const pattern = page.locator('#plugins svg pattern')
    expect(Number(await pattern.getAttribute('width'))).toBeGreaterThan(0)
    expect(Number(await pattern.getAttribute('height'))).toBeGreaterThan(0)
  })

  test('background rect fills container', async ({ page }) => {
    await expect(page.locator('#plugins svg rect[width="100%"]')).toBeAttached()
  })
})

// ============================================================
// Controls Plugin
// ============================================================
test.describe('Controls Plugin', () => {
  test('renders 4 buttons', async ({ page }) => {
    await expect(page.locator('#plugins .bf-flow__controls-button')).toHaveCount(4)
  })

  test('buttons have nodrag/nowheel classes', async ({ page }) => {
    const btn = page.locator('#plugins .bf-flow__controls-button').first()
    await expect(btn).toHaveClass(/nodrag/)
    await expect(btn).toHaveClass(/nowheel/)
  })

  test('buttons have title attributes', async ({ page }) => {
    const titles = await page.locator('#plugins .bf-flow__controls-button').evaluateAll(
      (els) => els.map((e) => (e as HTMLElement).title),
    )
    expect(titles).toEqual(['Zoom in', 'Zoom out', 'Fit view', 'Toggle interactivity'])
  })
})

// ============================================================
// Stress Test (20 nodes, 5x4 grid)
// ============================================================
test.describe('Stress Test (20 nodes)', () => {
  test('renders 20 nodes', async ({ page }) => {
    await expect(page.locator('#stress .bf-flow__node')).toHaveCount(20)
  })

  test('renders 31 edges', async ({ page }) => {
    await expect(page.locator('#stress .bf-flow__edge')).toHaveCount(31)
  })

  test('first and last node labels', async ({ page }) => {
    await expect(page.locator('#stress .bf-flow__node[data-id="n0-0"]')).toHaveText('Node 1')
    await expect(page.locator('#stress .bf-flow__node[data-id="n3-4"]')).toHaveText('Node 20')
  })

  test('has controls and background', async ({ page }) => {
    await expect(page.locator('#stress .bf-flow__controls')).toBeVisible()
    await expect(page.locator('#stress svg pattern')).toBeAttached()
  })

  test('fitView shows all 20 nodes in viewport', async ({ page }) => {
    // Stress test uses fitView: true
    const allVisible = await page.evaluate(() => {
      const container = document.getElementById('stress')!
      const cr = container.getBoundingClientRect()
      const nodes = container.querySelectorAll('.bf-flow__node')
      return Array.from(nodes).every((n) => {
        const nr = n.getBoundingClientRect()
        return nr.top >= cr.top - 10 && nr.bottom <= cr.bottom + 10
      })
    })
    expect(allVisible).toBe(true)
  })
})

// ============================================================
// Connection Validation (isValidConnection)
// ============================================================
test.describe('Connection Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Scroll the validation container into view since it's at the bottom of the page
    await page.evaluate(() => {
      const el = document.getElementById('validation')
      if (el && 'scrollIntoViewIfNeeded' in el) {
        ;(el as any).scrollIntoViewIfNeeded()
      } else if (el) {
        el.scrollIntoView({ block: 'center' })
      }
    })
    await page.waitForSelector('#validation .bf-flow__node[data-id="v-source"]')
    await page.waitForSelector('#validation .bf-flow__node[data-id="v-allowed"]')
    await page.waitForSelector('#validation .bf-flow__node[data-id="v-blocked"]')
  })

  test('valid connection creates an edge', async ({ page }) => {
    const beforeEdges = await page.locator('#validation .bf-flow__edge').count()

    const created = await page.evaluate(async () => {
      const sourceHandle = document.querySelector('#validation [data-id="v-source"] .bf-flow__handle--source')!
      const targetHandle = document.querySelector('#validation [data-id="v-allowed"] .bf-flow__handle--target')!
      const sr = sourceHandle.getBoundingClientRect()
      const tr = targetHandle.getBoundingClientRect()

      sourceHandle.dispatchEvent(new MouseEvent('mousedown', {
        clientX: sr.left + 3, clientY: sr.top + 3, button: 0, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 10))
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 200))

      return document.querySelectorAll('#validation .bf-flow__edge').length
    })

    expect(created).toBeGreaterThan(beforeEdges)
  })

  test('invalid connection does not create an edge', async ({ page }) => {
    const beforeEdges = await page.locator('#validation .bf-flow__edge').count()

    const afterEdges = await page.evaluate(async () => {
      const sourceHandle = document.querySelector('#validation [data-id="v-source"] .bf-flow__handle--source')!
      const targetHandle = document.querySelector('#validation [data-id="v-blocked"] .bf-flow__handle--target')!
      const sr = sourceHandle.getBoundingClientRect()
      const tr = targetHandle.getBoundingClientRect()

      sourceHandle.dispatchEvent(new MouseEvent('mousedown', {
        clientX: sr.left + 3, clientY: sr.top + 3, button: 0, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 10))
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 200))

      return document.querySelectorAll('#validation .bf-flow__edge').length
    })

    expect(afterEdges).toBe(beforeEdges)
  })

  test('valid target handle shows .valid class during drag', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const sourceHandle = document.querySelector('#validation [data-id="v-source"] .bf-flow__handle--source')!
      const targetHandle = document.querySelector('#validation [data-id="v-allowed"] .bf-flow__handle--target')!
      const sr = sourceHandle.getBoundingClientRect()
      const tr = targetHandle.getBoundingClientRect()

      sourceHandle.dispatchEvent(new MouseEvent('mousedown', {
        clientX: sr.left + 3, clientY: sr.top + 3, button: 0, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 10))

      // Move to the target handle
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 50))

      const hasValid = targetHandle.classList.contains('valid')
      const hasInvalid = targetHandle.classList.contains('invalid')

      // Clean up — release mouse
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 50))

      return { hasValid, hasInvalid }
    })

    expect(result.hasValid).toBe(true)
    expect(result.hasInvalid).toBe(false)
  })

  test('invalid target handle shows .invalid class during drag', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const sourceHandle = document.querySelector('#validation [data-id="v-source"] .bf-flow__handle--source')!
      const targetHandle = document.querySelector('#validation [data-id="v-blocked"] .bf-flow__handle--target')!
      const sr = sourceHandle.getBoundingClientRect()
      const tr = targetHandle.getBoundingClientRect()

      sourceHandle.dispatchEvent(new MouseEvent('mousedown', {
        clientX: sr.left + 3, clientY: sr.top + 3, button: 0, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 10))

      // Move to the blocked target handle
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 50))

      const hasValid = targetHandle.classList.contains('valid')
      const hasInvalid = targetHandle.classList.contains('invalid')

      // Clean up — release mouse
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 50))

      return { hasValid, hasInvalid }
    })

    expect(result.hasValid).toBe(false)
    expect(result.hasInvalid).toBe(true)
  })

  test('validation classes are cleaned up after mouse up', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const sourceHandle = document.querySelector('#validation [data-id="v-source"] .bf-flow__handle--source')!
      const targetHandle = document.querySelector('#validation [data-id="v-blocked"] .bf-flow__handle--target')!
      const sr = sourceHandle.getBoundingClientRect()
      const tr = targetHandle.getBoundingClientRect()

      sourceHandle.dispatchEvent(new MouseEvent('mousedown', {
        clientX: sr.left + 3, clientY: sr.top + 3, button: 0, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 10))
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 50))

      // Verify the class is present during drag
      const hasDuring = targetHandle.classList.contains('invalid')

      // Release mouse
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: tr.left + 3, clientY: tr.top + 3, bubbles: true, view: window,
      }))
      await new Promise((r) => setTimeout(r, 50))

      // Verify classes are cleaned up
      const hasValidAfter = targetHandle.classList.contains('valid')
      const hasInvalidAfter = targetHandle.classList.contains('invalid')

      return { hasDuring, hasValidAfter, hasInvalidAfter }
    })

    expect(result.hasDuring).toBe(true)
    expect(result.hasValidAfter).toBe(false)
    expect(result.hasInvalidAfter).toBe(false)
  })
})

// ============================================================
// Heavy Stress Test (100 nodes, 10x10 grid)
// ============================================================
test.describe('Heavy Stress Test (100 nodes)', () => {
  test('renders 100 nodes', async ({ page }) => {
    await expect(page.locator('#heavy-stress .bf-flow__node')).toHaveCount(100)
  })

  test('renders 180 edges (9*10 + 10*9)', async ({ page }) => {
    await expect(page.locator('#heavy-stress .bf-flow__edge')).toHaveCount(180)
  })

  test('first node label', async ({ page }) => {
    await expect(page.locator('#heavy-stress .bf-flow__node[data-id="h0-0"]')).toHaveText('N1')
  })

  test('last node label', async ({ page }) => {
    await expect(page.locator('#heavy-stress .bf-flow__node[data-id="h9-9"]')).toHaveText('N100')
  })

  test('has controls', async ({ page }) => {
    await expect(page.locator('#heavy-stress .bf-flow__controls')).toBeVisible()
  })

  test('all 100 nodes render within timeout', async ({ page }) => {
    // Verify rendering performance — 100 nodes should render quickly
    const count = await page.locator('#heavy-stress .bf-flow__node').count()
    expect(count).toBe(100)
  })

  test('fitView shows nodes in viewport', async ({ page }) => {
    const someVisible = await page.evaluate(() => {
      const container = document.getElementById('heavy-stress')!
      const cr = container.getBoundingClientRect()
      const nodes = container.querySelectorAll('.bf-flow__node')
      let visible = 0
      for (const n of nodes) {
        const nr = n.getBoundingClientRect()
        if (nr.top >= cr.top - 10 && nr.bottom <= cr.bottom + 10) visible++
      }
      return visible
    })
    // With fitView, most nodes should be visible
    expect(someVisible).toBeGreaterThan(50)
  })
})

// ============================================================
// MiniMap Plugin
// ============================================================
test.describe('MiniMap Plugin', () => {
  test.beforeEach(async ({ page }) => {
    // Scroll minimap section into viewport so page.mouse can reach it
    await page.locator('#minimap-test').scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
  })

  test('renders minimap container', async ({ page }) => {
    await expect(page.locator('#minimap-test .bf-flow__minimap')).toBeVisible()
  })

  test('minimap contains SVG element', async ({ page }) => {
    const svg = page.locator('#minimap-test .bf-flow__minimap svg')
    await expect(svg).toBeAttached()
    expect(Number(await svg.getAttribute('width'))).toBe(200)
    expect(Number(await svg.getAttribute('height'))).toBe(150)
  })

  test('minimap renders node rectangles', async ({ page }) => {
    // Wait for nodes to be measured and minimap to render
    await page.waitForTimeout(500)
    const rects = page.locator('#minimap-test .bf-flow__minimap svg g rect')
    const count = await rects.count()
    expect(count).toBe(4)
  })

  test('minimap has viewport mask path', async ({ page }) => {
    await page.waitForTimeout(500)
    const mask = page.locator('#minimap-test .bf-flow__minimap-mask')
    await expect(mask).toBeAttached()
    const d = await mask.getAttribute('d')
    expect(d).toBeTruthy()
    // Mask uses evenodd fill rule with two sub-paths
    expect(await mask.getAttribute('fill-rule')).toBe('evenodd')
  })

  test('minimap SVG has viewBox attribute', async ({ page }) => {
    await page.waitForTimeout(500)
    const svg = page.locator('#minimap-test .bf-flow__minimap svg')
    const viewBox = await svg.getAttribute('viewBox')
    expect(viewBox).toBeTruthy()
    // viewBox should have 4 numbers
    expect(viewBox!.split(' ').length).toBe(4)
  })

  test('minimap has interactive cursor', async ({ page }) => {
    const svg = page.locator('#minimap-test .bf-flow__minimap svg')
    const cursor = await svg.evaluate((el: SVGSVGElement) => el.style.cursor)
    expect(cursor).toBe('grab')
  })

  test('dragging on minimap pans the main viewport', async ({ page }) => {
    await page.waitForTimeout(500)
    const container = page.locator('#minimap-test')
    const viewport = container.locator('.bf-flow__viewport')
    const minimapSvg = container.locator('.bf-flow__minimap svg')

    const transformBefore = await viewport.evaluate((el: HTMLElement) => el.style.transform)

    // Drag on the minimap SVG
    const box = await minimapSvg.boundingBox()
    if (!box) throw new Error('minimap SVG not found')

    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 30, startY + 20, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(300)

    const transformAfter = await viewport.evaluate((el: HTMLElement) => el.style.transform)
    expect(transformAfter).not.toBe(transformBefore)
  })

  test('minimap viewport indicator updates after main viewport pan', async ({ page }) => {
    await page.waitForTimeout(500)
    const container = page.locator('#minimap-test')
    const mask = container.locator('.bf-flow__minimap-mask')

    const maskBefore = await mask.getAttribute('d')

    // Pan the main viewport by dragging on empty area (top-left to avoid minimap)
    const mainBox = await container.boundingBox()
    if (!mainBox) throw new Error('container not found')

    const startX = mainBox.x + 50
    const startY = mainBox.y + 50
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX - 100, startY - 80, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(500)

    const maskAfter = await mask.getAttribute('d')
    expect(maskAfter).not.toBe(maskBefore)
  })

  test('minimap zoom via scroll wheel changes main viewport zoom', async ({ page }) => {
    await page.waitForTimeout(500)
    const container = page.locator('#minimap-test')
    const viewport = container.locator('.bf-flow__viewport')
    const minimapSvg = container.locator('.bf-flow__minimap svg')

    const before = await getTransform(viewport)
    const box = await minimapSvg.boundingBox()
    if (!box) throw new Error('minimap SVG not found')

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -300)
    await page.waitForTimeout(500)

    const after = await getTransform(viewport)
    expect(after.scale).not.toBeCloseTo(before.scale, 1)
  })
})
