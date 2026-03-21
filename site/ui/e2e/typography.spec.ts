import { test, expect } from '@playwright/test'

test.describe('Typography Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/typography')
  })

  test.describe('Props Playground', () => {
    test('changing children text updates preview', async ({ page }) => {
      const preview = page.locator('[data-typography-preview]')
      const section = page.locator('#preview')
      const input = section.locator('input[type="text"]')

      await input.fill('Custom heading text')
      await expect(preview).toContainText('Custom heading text')
    })

    test('changing element to H2 updates preview', async ({ page }) => {
      const preview = page.locator('[data-typography-preview]')
      const section = page.locator('#preview')

      // Open element select and pick "H2"
      await section.locator('button[role="combobox"]').first().click()
      await page.locator('[role="option"]:has-text("H2")').click()

      // Preview should contain an h2 element
      await expect(preview.locator('h2')).toBeVisible()
    })

    test('changing element to Blockquote renders blockquote', async ({ page }) => {
      const preview = page.locator('[data-typography-preview]')
      const section = page.locator('#preview')

      // Open element select and pick "Blockquote"
      await section.locator('button[role="combobox"]').first().click()
      await page.locator('[role="option"]:has-text("Blockquote")').click()

      // Preview should contain a blockquote element
      await expect(preview.locator('blockquote')).toBeVisible()
    })
  })

  test.describe('Headings Example', () => {
    test('renders all heading levels', async ({ page }) => {
      const section = page.locator('#headings').locator('..')

      await expect(section.locator('[data-slot="typography-h1"]')).toContainText('This is H1')
      await expect(section.locator('[data-slot="typography-h2"]')).toContainText('This is H2')
      await expect(section.locator('[data-slot="typography-h3"]')).toContainText('This is H3')
      await expect(section.locator('[data-slot="typography-h4"]')).toContainText('This is H4')
    })
  })

  test.describe('Blockquote Example', () => {
    test('renders blockquote with italic text', async ({ page }) => {
      const section = page.locator('#blockquote').locator('..')
      const blockquote = section.locator('[data-slot="typography-blockquote"]')

      await expect(blockquote).toContainText('After all')
      await expect(blockquote).toHaveClass(/italic/)
    })
  })

  test.describe('List Example', () => {
    test('renders list with items', async ({ page }) => {
      const section = page.locator('#list').locator('..')
      const list = section.locator('[data-slot="typography-list"]')

      await expect(list.locator('li').first()).toContainText('1st level of puns')
      await expect(list.locator('li')).toHaveCount(3)
    })
  })

  test.describe('Text Styles Example', () => {
    test('renders large, small, and muted text', async ({ page }) => {
      const section = page.locator('#text-styles').locator('..')

      await expect(section.locator('[data-slot="typography-large"]')).toContainText('Are you absolutely sure?')
      await expect(section.locator('[data-slot="typography-small"]')).toContainText('Email address')
      await expect(section.locator('[data-slot="typography-muted"]')).toContainText('Enter your email address')
    })
  })
})
