/**
 * E2E coverage for the landing-page input/output demo.
 *
 * Verifies the user-facing interactive behavior of the demo frame
 * (manual tab switching between compiled-output panels — there is no
 * auto-rotation by design) and the responsive single-column stacking
 * the mock specifies at ≤760px.
 */

import { test, expect } from '@playwright/test'

test.describe('landing page demo', () => {
  test('first example and output panel are visible by default', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.src-panel.active')).toHaveAttribute('data-example', 'counter')
    await expect(page.locator('.out-panel.active')).toHaveAttribute('data-panel', 'counter-go')
    // All 8 adapters are offered.
    await expect(page.locator('.tab[data-out]')).toHaveCount(8)
  })

  test('clicking an adapter tab switches the visible output panel', async ({ page }) => {
    await page.goto('/')
    await page.locator('.tab[data-out="erb"]').click()
    await expect(page.locator('.out-panel[data-panel="counter-erb"]')).toBeVisible()
    await expect(page.locator('.out-panel[data-panel="counter-go"]')).toBeHidden()
    await expect(page.locator('.tab[data-out="erb"]')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.tab[data-out="go"]')).toHaveAttribute('aria-selected', 'false')
  })

  test('clicking an example tab switches source and keeps the adapter', async ({ page }) => {
    await page.goto('/')
    await page.locator('.tab[data-out="twig"]').click()
    await page.locator('.tab[data-example="items"]').click()
    await expect(page.locator('.src-panel[data-example="items"]')).toBeVisible()
    await expect(page.locator('.out-panel[data-panel="items-twig"]')).toBeVisible()
  })

  test('tabs never rotate on their own', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2500)
    await expect(page.locator('.tab[data-out][aria-selected="true"]')).toHaveAttribute('data-out', 'go')
    await expect(page.locator('.tab[data-example][aria-selected="true"]')).toHaveAttribute('data-example', 'counter')
  })

  test('matrix renders one cell per component × adapter from real data', async ({ page }) => {
    await page.goto('/')
    const rows = page.locator('.matrix-row')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(8)
    // Every row renders the full component set.
    const firstRowCells = await rows.first().locator('.cell').count()
    expect(firstRowCells).toBeGreaterThanOrEqual(62)
  })

  test('demo panes stack vertically at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    const panes = page.locator('.demo-frame .pane')
    const first = await panes.nth(0).boundingBox()
    const second = await panes.nth(1).boundingBox()
    expect(first && second && second.y > first.y + first.height - 1).toBeTruthy()
  })

  test('quickstart copy button copies the command', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    await page.locator('.copy-btn').click()
    await expect(page.locator('.copy-btn')).toHaveText('copied')
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toBe('npm create barefootjs@latest')
  })
})
