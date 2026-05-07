import { test, expect } from '@playwright/test'

test.describe('Forms Introduction Page — Controlled Input demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/forms/introduction')
  })

  test('displays basic controlled demo', async ({ page }) => {
    await expect(page.locator('[bf-s^="BasicControlledDemo_"]')).toBeVisible()
  })

  test('updates display when typing', async ({ page }) => {
    const demo = page.locator('[bf-s^="BasicControlledDemo_"]')
    const input = demo.locator('input')
    const display = demo.locator('.current-value')

    await expect(display).toHaveText('')

    await input.fill('Hello World')
    await expect(display).toHaveText('Hello World')
  })

  test('handles rapid typing', async ({ page }) => {
    const demo = page.locator('[bf-s^="BasicControlledDemo_"]')
    const input = demo.locator('input')
    const display = demo.locator('.current-value')

    await input.pressSequentially('abcdefghij', { delay: 10 })
    await expect(display).toHaveText('abcdefghij')
  })

  test('handles typing in middle of text', async ({ page }) => {
    const demo = page.locator('[bf-s^="BasicControlledDemo_"]')
    const input = demo.locator('input')
    const display = demo.locator('.current-value')

    await input.fill('Hello World')
    await expect(display).toHaveText('Hello World')

    await input.focus()
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(5, 5))
    await input.pressSequentially(' Beautiful')
    await expect(display).toHaveText('Hello Beautiful World')
  })
})
