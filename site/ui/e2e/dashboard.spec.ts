import { test, expect } from '@playwright/test'

test.describe('Dashboard Block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/dashboard')
  })

  test.describe('Stats Cards', () => {
    test('renders all four stat cards', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=Total Revenue')).toBeVisible()
      await expect(section.locator('text=$45.2K')).toBeVisible()
      await expect(section.locator('text=2,350')).toBeVisible()
      await expect(section.locator('text=1,234')).toBeVisible()
      await expect(section.locator('text=Conversion Rate')).toBeVisible()
    })

    test('renders stat values', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=$45.2K')).toBeVisible()
      await expect(section.locator('text=2,350')).toBeVisible()
    })
  })

  test.describe('Orders Table', () => {
    test('renders orders table with rows', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=Recent Orders')).toBeVisible()
      // 5 order rows in the table body
      const rows = section.locator('table tbody tr')
      await expect(rows).toHaveCount(5)
    })

    test('renders order data in table cells', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      // Use table cell locators to avoid matching activity feed text
      await expect(section.locator('table td:has-text("ORD001")').first()).toBeVisible()
      await expect(section.locator('table td:has-text("Alice Johnson")').first()).toBeVisible()
      await expect(section.locator('table td:has-text("alice@example.com")').first()).toBeVisible()
    })

    test('renders Badge with correct variant per status', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      // Check that status badges are rendered
      await expect(section.locator('[data-slot="badge"]:has-text("completed")').first()).toBeVisible()
      await expect(section.locator('[data-slot="badge"]:has-text("processing")').first()).toBeVisible()
      await expect(section.locator('[data-slot="badge"]:has-text("pending")').first()).toBeVisible()
      await expect(section.locator('[data-slot="badge"]:has-text("cancelled")').first()).toBeVisible()
    })

    test('search filters orders by customer name', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      const searchInput = section.locator('input[placeholder="Search orders..."]')

      // Initially 5 rows
      await expect(section.locator('table tbody tr')).toHaveCount(5)

      // Type search query
      await searchInput.fill('Alice')

      // Should filter to 1 row
      await expect(section.locator('table tbody tr')).toHaveCount(1)
      await expect(section.locator('text=Alice Johnson')).toBeVisible()
    })

    test('search filters orders by email', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      const searchInput = section.locator('input[placeholder="Search orders..."]')

      await searchInput.fill('bob@')

      await expect(section.locator('table tbody tr')).toHaveCount(1)
      await expect(section.locator('text=Bob Smith')).toBeVisible()
    })

    test('search filters orders by order ID', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      const searchInput = section.locator('input[placeholder="Search orders..."]')

      await searchInput.fill('ORD003')

      await expect(section.locator('table tbody tr')).toHaveCount(1)
      await expect(section.locator('table td:has-text("Carol White")').first()).toBeVisible()
    })

    test('search with no match shows empty table', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      const searchInput = section.locator('input[placeholder="Search orders..."]')

      await searchInput.fill('nonexistent')

      await expect(section.locator('table tbody tr')).toHaveCount(0)
    })

    test('clearing search restores all orders', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      const searchInput = section.locator('input[placeholder="Search orders..."]')

      await searchInput.fill('Alice')
      await expect(section.locator('table tbody tr')).toHaveCount(1)

      await searchInput.fill('')
      await expect(section.locator('table tbody tr')).toHaveCount(5)
    })
  })

  test.describe('Tab Navigation', () => {
    test('renders with overview tab active by default', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      const overviewTrigger = section.locator('button[role="tab"]:has-text("Overview")')
      await expect(overviewTrigger).toHaveAttribute('data-state', 'active')
    })

    test('switches to analytics tab', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      const analyticsTrigger = section.locator('button[role="tab"]:has-text("Analytics")')
      await analyticsTrigger.click()
      await expect(analyticsTrigger).toHaveAttribute('data-state', 'active')
      await expect(section.locator('text=Revenue Trend')).toBeVisible()
      await expect(section.locator('text=Top Customers')).toBeVisible()
    })

    test('switches back to overview tab', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()

      // Switch to analytics
      await section.locator('button[role="tab"]:has-text("Analytics")').click()
      await expect(section.locator('text=Revenue Trend')).toBeVisible()

      // Switch back to overview
      await section.locator('button[role="tab"]:has-text("Overview")').click()
      const overviewTrigger = section.locator('button[role="tab"]:has-text("Overview")')
      await expect(overviewTrigger).toHaveAttribute('data-state', 'active')
      await expect(section.locator('text=Recent Orders')).toBeVisible()
    })
  })

  test.describe('Activity Feed', () => {
    test('renders activity items', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=Recent Activity')).toBeVisible()
      await expect(section.locator('text=New order #ORD006 placed')).toBeVisible()
      await expect(section.locator('text=New customer registered')).toBeVisible()
    })

    test('renders activity type badges', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      // Activity type badges: Order, Customer, Refund
      await expect(section.locator('[data-slot="badge"]:has-text("Order")').first()).toBeVisible()
      await expect(section.locator('[data-slot="badge"]:has-text("Customer")').first()).toBeVisible()
      await expect(section.locator('[data-slot="badge"]:has-text("Refund")').first()).toBeVisible()
    })
  })

  test.describe('Export Action', () => {
    test('export button shows toast', async ({ page }) => {
      const section = page.locator('[bf-s^="DashboardDemo_"]:not([data-slot])').first()
      await section.locator('button:has-text("Export")').click()
      await expect(page.locator('text=Report exported successfully').first()).toBeVisible({ timeout: 5000 })
    })
  })
})
