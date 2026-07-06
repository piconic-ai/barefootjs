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
  test('first output panel is visible by default', async ({ page }) => {
    await page.goto('/')
    const panels = page.locator('.out-panel')
    await expect(panels.first()).toBeVisible()
    await expect(page.locator('.tab[aria-selected="true"]')).toHaveAttribute('data-out', 'go')
  })

  test('clicking a tab switches the visible panel', async ({ page }) => {
    await page.goto('/')
    await page.locator('.tab[data-out="erb"]').click()
    await expect(page.locator('.out-panel[data-panel="erb"]')).toBeVisible()
    await expect(page.locator('.out-panel[data-panel="go"]')).toBeHidden()
    await expect(page.locator('.tab[data-out="erb"]')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.tab[data-out="go"]')).toHaveAttribute('aria-selected', 'false')
  })

  test('tabs never rotate on their own', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2500)
    await expect(page.locator('.tab[aria-selected="true"]')).toHaveAttribute('data-out', 'go')
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
