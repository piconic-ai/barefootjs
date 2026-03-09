import { test, expect } from '@playwright/test'

test.describe('Card Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    // Use domcontentloaded to avoid waiting for external images (unsplash, dicebear)
    await page.goto('/docs/components/card', { waitUntil: 'domcontentloaded' })
  })

  test.describe('Card Preview', () => {
    test('displays preview card (Swiss Alps Adventure)', async ({ page }) => {
      // Check that preview card has the travel card example
      await expect(page.locator('text=Swiss Alps Adventure').first()).toBeVisible()
      await expect(page.locator('text=Experience breathtaking views').first()).toBeVisible()
    })
  })

  test.describe('Card Examples', () => {
    test('displays Stats Cards example', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Total Sales' })).toBeVisible()
      await expect(page.locator('text=$45,231').first()).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Active Users' })).toBeVisible()
      await expect(page.locator('text=2,350').first()).toBeVisible()
    })

    test('displays Profile Card example', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Emily Chen' })).toBeVisible()
      await expect(page.locator('text=Senior Product Designer').first()).toBeVisible()
    })

    test('displays Login Form example', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Login to your account' })).toBeVisible()
      await expect(page.locator('button:has-text("Login")')).toBeVisible()
    })
  })

  test.describe('Children Composition', () => {
    test('CardHeader contains CardTitle and CardDescription', async ({ page }) => {
      // Verify composition: CardHeader should contain both title and description
      // Profile Card example demonstrates this well
      const profileCard = page.locator('.w-\\[350px\\]').filter({ hasText: 'Emily Chen' }).first()
      await expect(profileCard.locator('h3:has-text("Emily Chen")')).toBeVisible()
      await expect(profileCard.locator('p:has-text("Senior Product Designer")')).toBeVisible()
    })

    test('Card contains nested sub-components', async ({ page }) => {
      // Verify composition: Login Form Card contains header, content, and footer areas
      // The login card is the one with max-w-sm class
      const loginCard = page.locator('.max-w-sm[data-slot="card"]')
      // Card structure includes title, description, content, and footer
      await expect(loginCard.getByRole('heading', { name: 'Login to your account' })).toBeVisible()
      await expect(loginCard.getByText('Enter your email below')).toBeVisible()
      await expect(loginCard.locator('button:has-text("Login")')).toBeVisible()
    })
  })

})

test.describe('Card Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/card', { waitUntil: 'domcontentloaded' })
  })

  test('renders page header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Card')
  })

  test('renders playground with card', async ({ page }) => {
    await expect(page.locator('[data-slot="card"]').first()).toBeVisible()
  })

  test('renders API reference section', async ({ page }) => {
    await expect(page.locator('#api-reference')).toBeVisible()
  })
})
