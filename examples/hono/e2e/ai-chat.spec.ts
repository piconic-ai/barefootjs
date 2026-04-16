import { test, expect } from '@playwright/test'

test.describe('AI Chat (SSE Streaming)', () => {
  test.setTimeout(15000)

  test.beforeEach(async ({ page }) => {
    await page.goto('/ai-chat')
  })

  test('shows chat input on load', async ({ page }) => {
    await expect(page.locator('.chat-input')).toBeVisible()
    await expect(page.locator('.chat-send')).toBeVisible()
  })

  test('user message appears after sending', async ({ page }) => {
    await page.fill('.chat-input', 'こんにちは')
    await page.click('.chat-send')

    await expect(page.locator('.chat-user')).toBeVisible()
    await expect(page.locator('.chat-user .chat-bubble p')).toHaveText('こんにちは')
    await expect(page.locator('.chat-input')).toHaveValue('')
  })

  test('AI response streams in after sending a message', async ({ page }) => {
    await page.fill('.chat-input', 'テスト')
    await page.click('.chat-send')

    // Streaming response appears (cursor visible during streaming)
    await expect(page.locator('.chat-assistant')).toBeVisible({ timeout: 3000 })

    // Streaming completes and final message is present
    await expect(page.locator('.chat-assistant .chat-bubble p')).not.toBeEmpty({ timeout: 10000 })
    await expect(page.locator('.streaming-cursor')).toBeHidden({ timeout: 10000 })
  })

  test('can send message with Enter key', async ({ page }) => {
    await page.fill('.chat-input', 'Enterキーテスト')
    await page.press('.chat-input', 'Enter')

    await expect(page.locator('.chat-user')).toBeVisible()
    await expect(page.locator('.chat-user .chat-bubble p')).toHaveText('Enterキーテスト')
  })

  test('can send multiple messages sequentially', async ({ page }) => {
    await page.fill('.chat-input', '1つ目')
    await page.click('.chat-send')
    await expect(page.locator('.chat-user').first()).toBeVisible()

    // Wait for first AI response to complete
    await expect(page.locator('.streaming-cursor')).toBeHidden({ timeout: 10000 })

    await page.fill('.chat-input', '2つ目')
    await page.click('.chat-send')

    await expect(page.locator('.chat-user')).toHaveCount(2, { timeout: 3000 })
    await expect(page.locator('.chat-assistant')).toHaveCount(2, { timeout: 10000 })
  })
})
