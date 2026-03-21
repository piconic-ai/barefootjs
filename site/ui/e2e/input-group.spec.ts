import { test, expect } from '@playwright/test'

test.describe('InputGroup Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/input-group')
  })

  test.describe('Basic Demo (Prefix & Suffix)', () => {
    test('renders input groups with addons', async ({ page }) => {
      const section = page.locator('[bf-s^="InputGroupBasicDemo_"]:not([data-slot])').first()
      const groups = section.locator('[data-slot="input-group"]')

      // Should have 3 input groups (https://, USD, search icon)
      await expect(groups).toHaveCount(3)
    })

    test('first group has prefix addon with text', async ({ page }) => {
      const section = page.locator('[bf-s^="InputGroupBasicDemo_"]:not([data-slot])').first()
      const firstGroup = section.locator('[data-slot="input-group"]').first()

      // Has addon with inline-start alignment
      const addon = firstGroup.locator('[data-slot="input-group-addon"]')
      await expect(addon).toHaveAttribute('data-align', 'inline-start')

      // Has input control
      const input = firstGroup.locator('[data-slot="input-group-control"]')
      await expect(input).toBeVisible()
    })

    test('second group has suffix addon', async ({ page }) => {
      const section = page.locator('[bf-s^="InputGroupBasicDemo_"]:not([data-slot])').first()
      const secondGroup = section.locator('[data-slot="input-group"]').nth(1)

      const addon = secondGroup.locator('[data-slot="input-group-addon"]')
      await expect(addon).toHaveAttribute('data-align', 'inline-end')
    })

    test('input accepts text entry', async ({ page }) => {
      const section = page.locator('[bf-s^="InputGroupBasicDemo_"]:not([data-slot])').first()
      const input = section.locator('[data-slot="input-group-control"]').first()

      await input.fill('mysite.com')
      await expect(input).toHaveValue('mysite.com')
    })
  })

  test.describe('Button Demo', () => {
    test('renders input groups with buttons', async ({ page }) => {
      const section = page.locator('[bf-s^="InputGroupButtonDemo_"]:not([data-slot])').first()
      const buttons = section.locator('[data-slot="input-group-button"]')

      // Should have buttons (Copy button + icon button)
      await expect(buttons.first()).toBeVisible()
    })

    test('copy button is clickable', async ({ page }) => {
      const section = page.locator('[bf-s^="InputGroupButtonDemo_"]:not([data-slot])').first()
      const input = section.locator('[data-slot="input-group-control"]').first()
      const copyButton = section.locator('[data-slot="input-group-button"]').first()

      await input.fill('test text')
      await expect(copyButton).toBeEnabled()
    })
  })

  test.describe('Password Demo', () => {
    test('input starts as password type', async ({ page }) => {
      const section = page.locator('[bf-s^="InputGroupPasswordDemo_"]:not([data-slot])').first()
      const input = section.locator('[data-slot="input-group-control"]')

      await expect(input).toHaveAttribute('type', 'password')
    })

    test('clicking toggle button changes input type to text', async ({ page }) => {
      const section = page.locator('[bf-s^="InputGroupPasswordDemo_"]:not([data-slot])').first()
      const input = section.locator('[data-slot="input-group-control"]')
      const toggleButton = section.locator('[data-slot="input-group-button"]')

      await toggleButton.click()
      await expect(input).toHaveAttribute('type', 'text')
    })

    test('clicking toggle button twice reverts to password', async ({ page }) => {
      const section = page.locator('[bf-s^="InputGroupPasswordDemo_"]:not([data-slot])').first()
      const input = section.locator('[data-slot="input-group-control"]')
      const toggleButton = section.locator('[data-slot="input-group-button"]')

      await toggleButton.click()
      await expect(input).toHaveAttribute('type', 'text')

      await toggleButton.click()
      await expect(input).toHaveAttribute('type', 'password')
    })
  })
})
