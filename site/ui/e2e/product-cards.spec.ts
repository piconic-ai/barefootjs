import { test, expect } from '@playwright/test'

test.describe('Product Cards Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/product-cards')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="ProductCardsDemo_"]:not([data-slot])').first()

  test.describe('Filter Bar', () => {
    test('renders filter controls', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.product-search')).toBeVisible()
      await expect(s.locator('.category-filter')).toBeVisible()
      await expect(s.locator('.view-toggle')).toBeVisible()
    })

    test('search filters products by name', async ({ page }) => {
      const s = section(page)
      await s.locator('.product-search').fill('headphones')
      await expect(s.locator('.product-count')).toContainText('1 ')
    })

    test('search input retains focus', async ({ page }) => {
      const s = section(page)
      const search = s.locator('.product-search')
      await search.focus()
      await search.type('key', { delay: 30 })
      const isFocused = await search.evaluate((el: HTMLElement) => document.activeElement === el)
      expect(isFocused).toBe(true)
    })

    test('clearing search restores products', async ({ page }) => {
      const s = section(page)
      await s.locator('.product-search').fill('headphones')
      await s.locator('.product-search').fill('')
      await expect(s.locator('.product-count')).toContainText('12 products')
    })
  })

  test.describe('Empty State', () => {
    test('shows when no products match', async ({ page }) => {
      const s = section(page)
      await s.locator('.product-search').fill('nonexistent')
      await expect(s.locator('.product-empty')).toBeVisible()
    })
  })

  test.describe('View Mode Toggle', () => {
    test('defaults to grid layout', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.product-grid')).toHaveClass(/grid-cols-2|grid-cols-3/)
    })

    test('toggling changes to list layout', async ({ page }) => {
      const s = section(page)
      await s.locator('.view-toggle').click()
      await expect(s.locator('.product-grid')).not.toHaveClass(/grid-cols-2/)
    })
  })

  test.describe('Product Cards', () => {
    test('renders product cards', async ({ page }) => {
      const s = section(page)
      const cards = s.locator('.product-card')
      await expect(cards).toHaveCount(12)
    })

    test('shows Sale badge on discounted products', async ({ page }) => {
      const s = section(page)
      const saleBadges = s.locator('.sale-badge')
      const count = await saleBadges.count()
      expect(count).toBeGreaterThan(0)
    })

    test('shows category badges', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.category-badge').first()).toBeVisible()
    })

    test('shows tag badges (inner loop)', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.tag-badge').first()).toBeVisible()
    })

    test('shows rating stars', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.product-rating').first()).toBeVisible()
    })

    test('disables add-to-cart for out-of-stock', async ({ page }) => {
      const s = section(page)
      const outOfStock = s.locator('.add-to-cart-btn:has-text("Out of Stock")')
      await expect(outOfStock.first()).toBeDisabled()
    })
  })

  test.describe('Cart Sidebar', () => {
    test('cart starts empty', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.cart-count')).toContainText('0')
      await expect(s.locator('.cart-empty')).toBeVisible()
    })

    test('adding product shows it in cart', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-to-cart-btn').first().click()
      await expect(s.locator('.cart-item')).toHaveCount(1)
      await expect(s.locator('.cart-count')).toContainText('1')
    })

    test('adding same product increments quantity', async ({ page }) => {
      const s = section(page)
      const btn = s.locator('.add-to-cart-btn').first()
      await btn.click()
      await btn.click()
      await expect(s.locator('.cart-item-qty')).toContainText('2')
    })

    test('quantity buttons work', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-to-cart-btn').first().click()
      await s.locator('.qty-plus').first().click()
      await expect(s.locator('.cart-item-qty')).toContainText('2')
      await s.locator('.qty-minus').first().click()
      await expect(s.locator('.cart-item-qty')).toContainText('1')
    })

    test('remove button removes item', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-to-cart-btn').first().click()
      await s.locator('.remove-btn').first().click()
      await expect(s.locator('.cart-empty')).toBeVisible()
    })

    test('subtotal updates', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-to-cart-btn').first().click()
      await expect(s.locator('.cart-total')).toBeVisible()
    })
  })

  test.describe('Free Shipping', () => {
    test('shows shipping message below threshold', async ({ page }) => {
      const s = section(page)
      // Add a cheap item (Phone Case $29) to stay below $100 threshold
      await s.locator('.product-card:has-text("Phone Case") .add-to-cart-btn').click()
      await expect(s.locator('.shipping-message')).toBeVisible()
    })

    test('shows free shipping badge above threshold', async ({ page }) => {
      const s = section(page)
      // Add expensive items to exceed $100 threshold
      const btns = s.locator('.add-to-cart-btn:not([disabled])')
      await btns.nth(0).click() // Wireless Headphones $199
      await expect(s.locator('.free-shipping')).toBeVisible()
    })
  })

  test.describe('Toast', () => {
    test('shows toast when item added', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-to-cart-btn').first().click()
      await expect(page.locator('[data-slot="toast"]')).toBeVisible({ timeout: 3000 })
    })
  })
})
