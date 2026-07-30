import { test, expect } from '@playwright/test'
import type { Locator } from '@playwright/test'

// E2E coverage for the JSX-native xyflow components shipped via the
// shadcn registry. Static-structure assertions only — pan / zoom / drag
// / connection-drag interactivity tests come back online once cutover
// step C4 attaches the imperative pointer-paced subsystems via the
// `<Flow>` `ref` callback. The corresponding `test.describe.skip`
// blocks below are removed in C4.
//
// Note: the reference page mounts the same demo twice (once in the
// "Preview" section, once in the "Usage" example), so every demo
// scope is narrowed with `.first()` to avoid Playwright's strict-mode
// "resolved to N elements" failure.

function firstScope(page: import('@playwright/test').Page, selector: string): Locator {
  return page.locator(selector).first()
}

test.describe('xyflow Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/xyflow/components')
  })

  // ------------------------------------------------------------
  test.describe('Preview', () => {
    const scope = '[bf-s^="XyflowPreviewDemo_"][bf-r]:not([data-slot])'

    test('renders the .bf-flow root', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('.bf-flow').first()).toBeVisible()
    })

    test('renders the viewport wrapper', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('.bf-flow__viewport').first()).toBeAttached()
    })

    test('renders the edges <svg> layer', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('svg.bf-flow__edges').first()).toBeAttached()
    })

    test('renders four nodes from initialNodes', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('.bf-flow__node')).toHaveCount(4)
    })

    test('renders four edges as <path data-id>', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('.bf-flow__edge[data-id]')).toHaveCount(4)
      await expect(container.locator('path[data-hit-id]')).toHaveCount(4)
    })

    test('node labels are present', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('.bf-flow__node[data-id="1"]')).toBeAttached()
      await expect(container.locator('.bf-flow__node[data-id="4"]')).toBeAttached()
    })
  })

  // ------------------------------------------------------------
  test.describe('Background Plugin', () => {
    const scope = '[bf-s^="XyflowPreviewDemo_"][bf-r]:not([data-slot])'

    test('renders an SVG <pattern>', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('pattern').first()).toBeAttached()
    })

    test('pattern has explicit width / height attributes', async ({ page }) => {
      const container = firstScope(page, scope)
      const pattern = container.locator('pattern').first()
      const width = await pattern.getAttribute('width')
      const height = await pattern.getAttribute('height')
      expect(Number(width)).toBeGreaterThan(0)
      expect(Number(height)).toBeGreaterThan(0)
    })

    test('full-size <rect> fills the background', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('svg rect[width="100%"]').first()).toBeAttached()
    })
  })

  // ------------------------------------------------------------
  test.describe('Controls Plugin', () => {
    const scope = '[bf-s^="XyflowPreviewDemo_"][bf-r]:not([data-slot])'

    test('renders four control buttons', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('.bf-flow__controls-button')).toHaveCount(4)
    })

    test('buttons carry nodrag / nowheel classes', async ({ page }) => {
      const container = firstScope(page, scope)
      const btn = container.locator('.bf-flow__controls-button').first()
      await expect(btn).toHaveClass(/nodrag/)
      await expect(btn).toHaveClass(/nowheel/)
    })

    test('buttons expose the four control titles', async ({ page }) => {
      const container = firstScope(page, scope)
      const titles = await container
        .locator('.bf-flow__controls-button')
        .evaluateAll((els) => els.map((e) => (e as HTMLElement).title))
      expect(titles).toEqual(['Zoom in', 'Zoom out', 'Fit view', 'Toggle interactivity'])
    })
  })

  // ------------------------------------------------------------
  test.describe('MiniMap Plugin', () => {
    const scope = '[bf-s^="XyflowPreviewDemo_"][bf-r]:not([data-slot])'

    test('renders the minimap container', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('.bf-flow__minimap').first()).toBeVisible()
    })

    test('minimap carries nopan / nowheel / nodrag classes', async ({ page }) => {
      const container = firstScope(page, scope)
      const minimap = container.locator('.bf-flow__minimap').first()
      await expect(minimap).toHaveClass(/nopan/)
      await expect(minimap).toHaveClass(/nowheel/)
      await expect(minimap).toHaveClass(/nodrag/)
    })

    test('renders the viewport mask path', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('.bf-flow__minimap-mask').first()).toBeAttached()
    })
  })

  // ------------------------------------------------------------
  test.describe('Background Variants Demo', () => {
    const scope = '[bf-s^="XyflowBackgroundVariantsDemo_"][bf-r]:not([data-slot])'

    test('renders three Flow containers', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('.bf-flow')).toHaveCount(3)
    })

    test('renders three <pattern> elements (one per variant)', async ({ page }) => {
      const container = firstScope(page, scope)
      await expect(container.locator('pattern')).toHaveCount(3)
    })
  })

  // ------------------------------------------------------------
  // Custom-node-body coverage. The compiler (#1211) hoists inline
  // JSX-returning arrows like `renderNode={(n) => <PillNode .../>}`
  // into synthesized client components, and the runtime (#1213) splices
  // the live HTMLElement returns into the branch template via
  // `__bfSlot` instead of stringifying them to "[object HTMLDivElement]".
  // ------------------------------------------------------------
  test.describe('renderNode JSX-callback (#1213)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/xyflow/nodes')
    })

    test('pill bodies hydrate without [object HTMLDivElement]', async ({ page }) => {
      const container = firstScope(page, '[bf-s^="XyflowCustomBodyDemo_"][bf-r]:not([data-slot])')
      await expect(container).toBeAttached()
      const text = await container.innerText()
      expect(text).not.toContain('[object')
    })

    test('pill nodes carry both source and target handles', async ({ page }) => {
      const container = firstScope(page, '[bf-s^="XyflowCustomBodyDemo_"][bf-r]:not([data-slot])')
      await expect(container.locator('.bf-flow__node')).toHaveCount(3)
      await expect(container.locator('.bf-flow__handle--source')).toHaveCount(3)
      await expect(container.locator('.bf-flow__handle--target')).toHaveCount(3)
    })

    test('fan router exposes top/right/bottom handles', async ({ page }) => {
      const container = firstScope(page, '[bf-s^="XyflowCustomHandlesDemo_"][bf-r]:not([data-slot])')
      await expect(container.locator('[data-handleid="top"]')).toBeAttached()
      await expect(container.locator('[data-handleid="right"]')).toBeAttached()
      await expect(container.locator('[data-handleid="bottom"]')).toBeAttached()
    })
  })

  // ------------------------------------------------------------
  // Pointer-paced interactivity. Cutover step C4 has shipped —
  // `attachFlowSubsystems` (`packages/xyflow/src/flow-subsystems.ts`)
  // wires XYPanZoom and a delegated single-node drag through `<Flow>`'s
  // `ref`, so the drag / pan-zoom placeholders below are now real tests.
  // ------------------------------------------------------------

  /** Pull the `scale(N)` factor out of a viewport transform string. */
  function scaleOf(transform: string | null): number {
    const m = /scale\(([\d.]+)\)/.exec(transform ?? '')
    return m ? Number(m[1]) : Number.NaN
  }

  /** Pull `translate(Xpx, Ypx)` out of a node transform string. */
  function translateOf(transform: string | null): { x: number; y: number } {
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform ?? '')
    return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: Number.NaN, y: Number.NaN }
  }

  test.describe('Node Dragging', () => {
    test('drag moves the node by the pointer delta', async ({ page }) => {
      const container = firstScope(page, '[bf-s^="XyflowPreviewDemo_"][bf-r]:not([data-slot])')
      const node = container.locator('.bf-flow__node').first()
      await expect(node).toBeAttached()

      const before = translateOf(await node.getAttribute('style'))
      expect(Number.isNaN(before.x)).toBe(false)

      // Scroll first, then measure. `page.mouse` works in viewport
      // coordinates and does not scroll on its own, so a box taken while the
      // node sits below the fold names a point no element occupies — the same
      // trap the wheel test hits, and the reason that one calls `hover()`.
      await node.scrollIntoViewIfNeeded()
      const box = await node.boundingBox()
      if (!box) throw new Error('node has no bounding box')
      // Grab the node's centre and drag. `steps` matters: the delegated
      // handler is pointer-paced, so a single jump emits no intermediate
      // `pointermove` and the drag would never accumulate.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 })
      await page.mouse.up()

      await expect
        .poll(async () => translateOf(await node.getAttribute('style')).x, { timeout: 2000 })
        .not.toBe(before.x)

      const after = translateOf(await node.getAttribute('style'))
      // Zoom is 1 on first paint, so the store delta is the pointer delta.
      // Two pixels of slack for sub-pixel pointer positions.
      expect(Math.abs(after.x - before.x - 60)).toBeLessThanOrEqual(2)
      expect(Math.abs(after.y - before.y - 40)).toBeLessThanOrEqual(2)
    })
  })

  test.describe('Pan / Zoom', () => {
    test('wheel zoom updates the viewport scale', async ({ page }) => {
      const container = firstScope(page, '[bf-s^="XyflowPreviewDemo_"][bf-r]:not([data-slot])')
      const pane = container.locator('.bf-flow').first()
      const viewport = container.locator('.bf-flow__viewport').first()
      await expect(viewport).toBeAttached()

      const before = scaleOf(await viewport.getAttribute('style'))
      expect(before).toBeCloseTo(1, 5)

      // `hover()` scrolls the pane into view first. Without it the pane's
      // centre can sit below the visible viewport, and a wheel aimed there
      // lands on no element at all (`elementFromPoint` → null) instead of
      // reaching the d3-zoom listener on the pane.
      await pane.hover()
      await page.mouse.wheel(0, -400)

      await expect
        .poll(async () => scaleOf(await viewport.getAttribute('style')), { timeout: 2000 })
        .toBeGreaterThan(before)
    })
  })

  test.describe('Highlight Depth (#135 stretch)', () => {
    test('slider moves through depth values; each node carries its own `--node-glow`', async ({ page }) => {
      // CSS-var × .map() × per-node binding inside a `renderNode`
      // callback that's invoked once per node. Each rendered node
      // publishes its own `--node-glow` inline style and the slider
      // signal flows through a Context so the callback doesn't
      // capture an init-scope local (which the JSX compiler forbids).
      await page.goto('/xyflow/nodes')

      const demo = page.locator('[data-highlight-depth-demo]')
      const slider = demo.locator('[data-highlight-depth-slider]')
      const root = demo.locator('[data-depth-node="root"]')
      const l2 = demo.locator('[data-depth-node="l2"]')

      await expect(demo).toBeVisible()
      // Initial slider = 2. Intensity = max(0, 1 - (slider - nodeDepth) * 0.25).
      // root (nodeDepth=0) → 1 - 2*0.25 = 0.50.
      // l2   (nodeDepth=2) → 1 - 0*0.25 = 1.00.
      await expect(root).toHaveAttribute('style', /--node-glow\s*:\s*0\.50/)
      await expect(l2).toHaveAttribute('style', /--node-glow\s*:\s*1\.00/)

      // Slide to 0 — root climbs to full glow, tier-2 fades to 0.
      await slider.evaluate((el) => {
        const input = el as HTMLInputElement
        input.value = '0'
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await expect(root).toHaveAttribute('style', /--node-glow\s*:\s*1\.00/)
      await expect(l2).toHaveAttribute('style', /--node-glow\s*:\s*0(?:\.00)?(?:[;\s]|$)/)

      // Slide to 4 — every node is past its depth, intensity decays.
      await slider.evaluate((el) => {
        const input = el as HTMLInputElement
        input.value = '4'
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      // root: 1 - 4*0.25 = 0
      // l2:   1 - 2*0.25 = 0.50
      await expect(root).toHaveAttribute('style', /--node-glow\s*:\s*0(?:\.00)?(?:[;\s]|$)/)
      await expect(l2).toHaveAttribute('style', /--node-glow\s*:\s*0\.50/)
    })
  })

  test.describe('rAF Flow Animation (#135)', () => {
    test('toggling on advances `stroke-dashoffset` via requestAnimationFrame', async ({ page }) => {
      // The pair: animate toggle + reactive `stroke-dashoffset`. Until
      // the user clicks, the path is static; clicking starts a
      // `createEffect`-owned rAF loop that re-evaluates the offset every
      // frame. Toggling off must drop it back to a stable value (the
      // cleanup callback releases the frame handle).
      await page.goto('/xyflow/edges')
      const demo = page.locator('[data-flow-animate]')
      const path = demo.locator('[data-flow-path]')
      const toggle = demo.locator('[data-flow-animate-toggle]')

      await expect(path).toHaveAttribute('stroke-dashoffset', '0')

      await toggle.click()

      // The rAF loop should produce a stream of distinct dashoffset
      // values. Polling for "moved off zero" is enough to prove the
      // effect is firing.
      await expect
        .poll(
          async () => Number(await path.getAttribute('stroke-dashoffset')),
          { timeout: 1500 },
        )
        .not.toBe(0)

      // Stop the animation — the offset should freeze (cleanup
      // released the frame handle, so no more rAF tick fires).
      await toggle.click()
      const stopped = await path.getAttribute('stroke-dashoffset')
      await page.waitForTimeout(120)
      const after = await path.getAttribute('stroke-dashoffset')
      expect(after).toBe(stopped)
    })
  })

  // Still skipped, but NOT on cutover step C4 — that shipped. The real
  // gap: `attachReconnectionHandler` (`packages/xyflow/src/connection.ts`)
  // is exported from `@barefootjs/xyflow` and has no caller. The JSX
  // components render no reconnection grips for it to attach to, so
  // there is no endpoint to drag. Un-skip once `<SimpleEdge>` renders
  // the grips and calls the handler.
  test.describe.skip('Edge Reconnection (no reconnection grips in the JSX renderer yet)', () => {
    test('reconnect handles update edge endpoints', async () => {
      // Fill in once `<SimpleEdge>` renders grips and wires
      // `attachReconnectionHandler`.
    })
  })
})
