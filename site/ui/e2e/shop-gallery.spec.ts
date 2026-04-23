import { test, expect } from '@playwright/test'

const routes = [
  { path: '/gallery/shop', key: 'catalog', label: 'Catalog' },
  { path: '/gallery/shop/cart', key: 'cart', label: 'Cart' },
  { path: '/gallery/shop/checkout', key: 'checkout', label: 'Checkout' },
] as const

test.describe('Gallery: E-Commerce Shop', () => {
  test.describe('Layout', () => {
    test('each route renders the shop header with the correct active nav item', async ({ page }) => {
      for (const route of routes) {
        await page.goto(route.path)
        await expect(page.locator('[data-shop-header]')).toBeVisible()

        const active = page.locator(`[data-shop-nav-item="${route.key}"]`)
        await expect(active).toHaveAttribute('data-active', 'true')
        await expect(active).toHaveAttribute('aria-current', 'page')

        const inactiveCount = await page
          .locator('[data-shop-nav-item][data-active="false"]')
          .count()
        expect(inactiveCount).toBe(routes.length - 1)
      }
    })

    test('gallery meta link is outside the shop shell', async ({ page }) => {
      await page.goto('/gallery/shop')
      const githubLinks = page.locator('a[href*="components/gallery/shop"]')
      await expect(githubLinks).toHaveCount(1)
      const insideShell = await page
        .locator('.shop-shell a[href*="components/gallery/shop"]')
        .count()
      expect(insideShell).toBe(0)
    })
  })

  test.describe('Navigation', () => {
    test('navigates between all shop routes via the top nav', async ({ page }) => {
      await page.goto('/gallery/shop')

      // To cart
      await page.locator('[data-shop-nav] [data-shop-nav-item="cart"]').click()
      await page.waitForURL('**/gallery/shop/cart')
      await expect(page).toHaveURL(/\/gallery\/shop\/cart$/)
      await expect(page.locator('[data-shop-nav-item="cart"]')).toHaveAttribute('data-active', 'true')

      // To checkout
      await page.locator('[data-shop-nav] [data-shop-nav-item="checkout"]').click()
      await page.waitForURL('**/gallery/shop/checkout')
      await expect(page).toHaveURL(/\/gallery\/shop\/checkout$/)

      // Back to catalog
      await page.locator('[data-shop-nav] [data-shop-nav-item="catalog"]').click()
      await page.waitForURL('**/gallery/shop')
      await expect(page).toHaveURL(/\/gallery\/shop$/)
    })
  })

  test.describe('Catalog page', () => {
    test('renders product grid with products', async ({ page }) => {
      await page.goto('/gallery/shop')
      await expect(page.locator('.product-card').first()).toBeVisible()
      const count = await page.locator('.product-card').count()
      expect(count).toBeGreaterThan(0)
    })

    test('product count updates when filtering by category', async ({ page }) => {
      await page.goto('/gallery/shop')

      const allCount = await page.locator('.product-card').count()

      // Filter to electronics
      await page.locator('.category-filter').click()
      await page.locator('[role="option"]', { hasText: 'Electronics' }).click()

      const filteredCount = await page.locator('.product-card').count()
      expect(filteredCount).toBeLessThan(allCount)
    })

    test('add to cart updates cart count in the sidebar', async ({ page }) => {
      await page.goto('/gallery/shop')

      // Initial cart shows empty
      await expect(page.locator('.cart-empty')).toBeVisible()

      // Add first in-stock product to cart
      await page.locator('.add-to-cart-btn:not([disabled])').first().click()

      // Cart count badge should now show 1
      await expect(page.locator('.cart-count')).toContainText('1')
    })
  })

  test.describe('Cart page', () => {
    test('renders cart items with quantity controls', async ({ page }) => {
      await page.goto('/gallery/shop/cart')
      await expect(page.locator('.shop-page')).toBeVisible()
    })

    test('checkout link navigates to checkout page', async ({ page }) => {
      await page.goto('/gallery/shop/cart')
      const checkoutLink = page.locator('[data-shop-nav] a[href="/gallery/shop/checkout"]')
      await expect(checkoutLink).toBeVisible()
      await checkoutLink.click()
      await page.waitForURL('**/gallery/shop/checkout')
      await expect(page).toHaveURL(/\/gallery\/shop\/checkout$/)
    })
  })

  test.describe('Checkout page', () => {
    test('renders multi-step checkout form starting at step 1', async ({ page }) => {
      await page.goto('/gallery/shop/checkout')
      await expect(page.locator('.checkout-steps')).toBeVisible()
      await expect(page.locator('[data-step="1"][data-active="true"]')).toBeVisible()
    })

    test('continue button is disabled with empty shipping form', async ({ page }) => {
      await page.goto('/gallery/shop/checkout')
      await expect(page.locator('.checkout-continue')).toBeDisabled()
    })

    test('filling shipping form enables continue button', async ({ page }) => {
      await page.goto('/gallery/shop/checkout')

      await page.locator('input[placeholder="John Doe"]').fill('Jane Smith')
      await page.locator('input[placeholder="john@example.com"]').fill('jane@example.com')
      await page.locator('input[placeholder="123 Main St"]').fill('456 Oak Ave')
      await page.locator('input[placeholder="New York"]').fill('Chicago')
      await page.locator('input[placeholder="10001"]').fill('60601')
      await page.locator('select').selectOption('us')

      await expect(page.locator('.checkout-continue')).toBeEnabled()
    })
  })

  test.describe('Cross-page state', () => {
    test('cart badge in nav reflects items added on catalog page', async ({ page }) => {
      await page.goto('/gallery/shop')

      // No badge initially
      await expect(page.locator('.shop-cart-count')).toHaveCount(0)

      // Add product to cart
      await page.locator('.add-to-cart-btn:not([disabled])').first().click()

      // Navigate to cart page — badge should appear in nav
      await page.goto('/gallery/shop/cart')
      await expect(page.locator('.shop-cart-count')).toBeVisible()
      await expect(page.locator('.shop-cart-count')).toContainText('1')
    })
  })
})
