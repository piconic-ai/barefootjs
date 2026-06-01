/**
 * Shared AI Chat (SSE Streaming) E2E Tests
 *
 * Exports a test function that can be imported by adapter integrations.
 */

import { test, expect } from '@playwright/test'

/**
 * Run AI Chat (SSE streaming) E2E tests.
 *
 * @param baseUrl - The base URL of the server (e.g., 'http://localhost:3001')
 */
export function aiChatTests(baseUrl: string) {
  test.describe('AI Chat (SSE Streaming)', () => {
    test.setTimeout(15000)

    test.beforeEach(async ({ page }) => {
      await page.goto(`${baseUrl}/ai-chat`)
    })

    test('shows chat input on load', async ({ page }) => {
      await expect(page.locator('.chat-input')).toBeVisible()
      await expect(page.locator('.chat-send')).toBeVisible()
    })

    test('user message appears after sending', async ({ page }) => {
      await page.fill('.chat-input', 'Hello')
      await page.click('.chat-send')

      await expect(page.locator('.chat-user')).toBeVisible()
      await expect(page.locator('.chat-user .chat-bubble p')).toHaveText('Hello')
      await expect(page.locator('.chat-input')).toHaveValue('')
    })

    test('AI response streams in after sending a message', async ({ page }) => {
      await page.fill('.chat-input', 'test')
      await page.click('.chat-send')

      await expect(page.locator('.chat-assistant')).toBeVisible({ timeout: 3000 })

      await expect(page.locator('.chat-assistant .chat-bubble p')).not.toBeEmpty({ timeout: 10000 })
      await expect(page.locator('.streaming-cursor')).toBeHidden({ timeout: 10000 })
    })

    test('can send message with Enter key', async ({ page }) => {
      await page.fill('.chat-input', 'Enter key test')
      await page.press('.chat-input', 'Enter')

      await expect(page.locator('.chat-user')).toBeVisible()
      await expect(page.locator('.chat-user .chat-bubble p')).toHaveText('Enter key test')
    })

    test('can send multiple messages sequentially', async ({ page }) => {
      await page.fill('.chat-input', 'first message')
      await page.click('.chat-send')
      await expect(page.locator('.chat-user').first()).toBeVisible()

      await expect(page.locator('.streaming-cursor')).toBeHidden({ timeout: 10000 })

      await page.fill('.chat-input', 'second message')
      await page.click('.chat-send')

      await expect(page.locator('.chat-user')).toHaveCount(2, { timeout: 3000 })
      await expect(page.locator('.chat-assistant')).toHaveCount(2, { timeout: 10000 })
    })
  })
}
