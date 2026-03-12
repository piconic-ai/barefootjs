import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('displays hero heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Ready-made components for BarefootJS')
  })

  test('displays hero description', async ({ page }) => {
    await expect(page.locator('text=Pick a component')).toBeVisible()
  })

  test('displays component showcase section', async ({ page }) => {
    await expect(page.locator('#components h2')).toContainText('Components')
  })

  test('displays component preview cards', async ({ page }) => {
    await expect(page.locator('#components a[href="/docs/components/accordion"]')).toBeVisible()
    await expect(page.locator('#components a[href="/components/button"]')).toBeVisible()
    await expect(page.locator('#components a[href="/components/card"]')).toBeVisible()
    await expect(page.locator('#components a[href="/docs/components/command"]')).toBeVisible()
    await expect(page.locator('#components a[href="/docs/components/dialog"]')).toBeVisible()
    await expect(page.locator('#components a[href="/components/select"]')).toBeVisible()
    await expect(page.locator('#components a[href="/docs/components/slider"]')).toBeVisible()
    await expect(page.locator('#components a[href="/docs/components/switch"]')).toBeVisible()
    await expect(page.locator('#components a[href="/docs/components/tabs"]')).toBeVisible()
  })

  test('displays form patterns section', async ({ page }) => {
    await expect(page.locator('h2:has-text("Form Patterns")')).toBeVisible()
    await expect(page.locator('#form-patterns a[href="/docs/forms/controlled-input"]')).toBeVisible()
    await expect(page.locator('#form-patterns a[href="/docs/forms/field-arrays"]')).toBeVisible()
    await expect(page.locator('#form-patterns a[href="/docs/forms/submit"]')).toBeVisible()
    await expect(page.locator('#form-patterns a[href="/docs/forms/validation"]')).toBeVisible()
  })

  test('navigates to Button page on click', async ({ page }) => {
    await page.locator('#components a[href="/components/button"]').click()
    await expect(page).toHaveURL('/components/button')
    await expect(page.locator('h1')).toContainText('Button')
  })
})
