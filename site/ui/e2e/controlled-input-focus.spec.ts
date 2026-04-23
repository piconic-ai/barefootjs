import { test, expect } from '@playwright/test'

test.describe('Controlled input focus preservation in loops', () => {
  test('field-arrays: typing preserves focus and value', async ({ page }) => {
    await page.goto('/docs/forms/field-arrays')
    await page.waitForLoadState('networkidle')

    const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
    const input = demo.locator('input').first()

    await input.focus()
    await input.type('test@example.com', { delay: 30 })

    // Focus must be preserved
    const isFocused = await input.evaluate(el => document.activeElement === el)
    expect(isFocused).toBe(true)
    await expect(input).toHaveValue('test@example.com')
  })

  test('field-arrays: typing in added field preserves focus', async ({ page }) => {
    await page.goto('/docs/forms/field-arrays')
    await page.waitForLoadState('networkidle')

    const demo = page.locator('[bf-s^="BasicFieldArrayDemo_"]')
    await demo.locator('button:has-text("+ Add Email")').click()
    const secondInput = demo.locator('input').nth(1)

    await secondInput.focus()
    await secondInput.type('user@test.com', { delay: 30 })

    const isFocused = await secondInput.evaluate(el => document.activeElement === el)
    expect(isFocused).toBe(true)
    await expect(secondInput).toHaveValue('user@test.com')
  })

  test('comments: editing textarea preserves focus', async ({ page }) => {
    await page.goto('/gallery/social/thread')
    await page.waitForLoadState('networkidle')

    const firstComment = page.locator('[bf-s^="SocialThreadDemo_"]:not([data-slot])').first().locator('.comment-item').first()
    await firstComment.locator('button:has-text("Edit")').click()

    const textarea = firstComment.locator('textarea')
    await textarea.fill('')
    await textarea.type('Updated text', { delay: 30 })

    const isFocused = await textarea.evaluate(el => document.activeElement === el)
    expect(isFocused).toBe(true)
    await expect(textarea).toHaveValue('Updated text')
  })
})
