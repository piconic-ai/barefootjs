/**
 * Shared Markdown Editor Component E2E Tests
 *
 * Exports a test function adapter integrations import with their base URL.
 */

import { test, expect } from '@playwright/test'

export function markdownEditorTests(baseUrl: string) {
  test.describe('Markdown Editor Component', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${baseUrl}/editor`)
    })

    test('renders the sample document in the preview', async ({ page }) => {
      await expect(
        page.locator('.md-preview .md-h1').first()
      ).toContainText('BarefootJS Markdown Editor')
    })

    test('typing updates the preview live', async ({ page }) => {
      const input = page.locator('.md-input')
      await input.fill('# Hello World')
      await expect(page.locator('.md-preview .md-h1')).toHaveText('Hello World')
    })

    test('word and character counters react to input', async ({ page }) => {
      const input = page.locator('.md-input')
      await input.fill('one two three')

      const stats = page.locator('.md-stats')
      await expect(stats).toContainText('3 words')
      await expect(stats).toContainText('13 characters')
    })

    test('renders bold inline formatting', async ({ page }) => {
      await page.locator('.md-input').fill('a **bold** word')
      await expect(page.locator('.md-preview strong')).toHaveText('bold')
    })

    test('renders list items with bullets', async ({ page }) => {
      await page.locator('.md-input').fill('- first\n- second')
      await expect(page.locator('.md-preview .md-li')).toHaveCount(2)
    })

    test('renders blockquotes', async ({ page }) => {
      await page.locator('.md-input').fill('> quoted text')
      await expect(page.locator('.md-preview .md-quote')).toHaveText('quoted text')
    })

    test('Clear button empties the editor', async ({ page }) => {
      await page.getByRole('button', { name: 'Clear' }).click()
      await expect(page.locator('.md-input')).toHaveValue('')
      await expect(page.locator('.md-stats')).toContainText('0 words')
    })

    test('Bold toolbar button inserts markers', async ({ page }) => {
      const input = page.locator('.md-input')
      await input.fill('')
      await page.getByRole('button', { name: 'Bold', exact: true }).click()
      await expect(input).toHaveValue('****')
    })
  })
}
