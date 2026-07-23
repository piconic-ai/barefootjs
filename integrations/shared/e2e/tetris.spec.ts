/**
 * Shared Tetris Component E2E Tests
 *
 * Exports a test function adapter integrations import with their base URL.
 */

import { test, expect } from '@playwright/test'

export function tetrisTests(baseUrl: string) {
  test.describe('Tetris Component', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${baseUrl}/tetris`)
    })

    test('renders a 10×20 board grid after hydration', async ({ page }) => {
      // 20 rows of 10 cells = 200 cells.
      await expect(page.locator('.t-board .t-cell')).toHaveCount(200)
    })

    test('shows the start overlay before the game begins', async ({ page }) => {
      await expect(page.locator('.t-overlay-title')).toHaveText('BarefootJS Tetris')
    })

    test('starting the game hides the overlay and spawns a piece', async ({ page }) => {
      await page.getByRole('button', { name: 'Start', exact: true }).click()
      await expect(page.locator('.t-overlay')).toHaveCount(0)
      // A spawned piece paints at least one coloured cell (classes t-c1..t-c7).
      await expect
        .poll(async () =>
          page.locator('.t-board .t-cell[class*="t-c"]').count()
        )
        .toBeGreaterThan(0)
    })

    test('a falling piece moves down over time', async ({ page }) => {
      await page.getByRole('button', { name: 'Start', exact: true }).click()

      // Capture which cells are filled, wait for a tick, and confirm the
      // filled set changed (the piece descended).
      const filledSignature = async () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll('.t-board .t-cell'))
            .map((el, i) => (/t-c[1-7]/.test(el.className) ? i : -1))
            .filter((i) => i >= 0)
            .join(',')
        )

      const before = await filledSignature()
      await expect.poll(filledSignature, { timeout: 3000 }).not.toBe(before)
    })

    test('score panel starts at zero', async ({ page }) => {
      const scorePanel = page.locator('.t-panel', { hasText: 'Score' })
      await expect(scorePanel.locator('.t-value')).toHaveText('0')
    })

    test('left/right arrow keys move the active piece horizontally', async ({ page }) => {
      await page.getByRole('button', { name: 'Start', exact: true }).click()

      // Columns occupied by the active piece (0..9), derived from filled indices.
      const columns = async () =>
        page.evaluate(() => {
          const cells = Array.from(document.querySelectorAll('.t-board .t-cell'))
          const cols = new Set<number>()
          cells.forEach((el, i) => {
            if (/t-c[1-7]/.test(el.className)) cols.add(i % 10)
          })
          return [...cols].sort((a, b) => a - b).join(',')
        })

      const before = await columns()
      await page.keyboard.press('ArrowRight')
      await expect.poll(columns).not.toBe(before)
    })

    test('pause overlay appears and resumes', async ({ page }) => {
      await page.getByRole('button', { name: 'Start', exact: true }).click()
      await page.locator('.t-controls').getByRole('button', { name: 'Pause' }).click()
      await expect(page.locator('.t-overlay-title')).toHaveText('Paused')
      await page.locator('.t-controls').getByRole('button', { name: 'Resume' }).click()
      await expect(page.locator('.t-overlay')).toHaveCount(0)
    })
  })
}
