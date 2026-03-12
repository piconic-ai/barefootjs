import { test, expect } from '@playwright/test'

test.describe('Sidebar Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/sidebar')
  })

  test.describe('Basic Sidebar', () => {
    test('renders sidebar with navigation items', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SidebarBasicDemo_"]').first()
      await expect(basicDemo).toBeVisible()

      // Sidebar should have navigation items
      const homeButton = basicDemo.locator('[data-slot="sidebar-menu-button"]:has-text("Home")')
      await expect(homeButton).toBeVisible()

      const projectsButton = basicDemo.locator('[data-slot="sidebar-menu-button"]:has-text("Projects")')
      await expect(projectsButton).toBeVisible()
    })

    test('active menu item has data-active attribute', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SidebarBasicDemo_"]').first()
      const homeButton = basicDemo.locator('[data-slot="sidebar-menu-button"][data-active]').first()
      await expect(homeButton).toBeVisible()
      await expect(homeButton).toContainText('Home')
    })

    test('renders sidebar header and footer', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SidebarBasicDemo_"]').first()

      const header = basicDemo.locator('[data-slot="sidebar-header"]').first()
      await expect(header).toBeVisible()
      await expect(header).toContainText('Acme Inc')

      const footer = basicDemo.locator('[data-slot="sidebar-footer"]').first()
      await expect(footer).toBeVisible()
      await expect(footer).toContainText('john@acme.com')
    })

    test('toggle button collapses/expands sidebar', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SidebarBasicDemo_"]').first()
      const trigger = basicDemo.locator('[data-slot="sidebar-trigger"]').first()

      // Initially expanded
      const sidebarWrapper = basicDemo.locator('[data-slot="sidebar-wrapper"]').first()
      await expect(sidebarWrapper).toHaveAttribute('data-state', 'expanded')

      // Click to collapse
      await trigger.click()
      await expect(sidebarWrapper).toHaveAttribute('data-state', 'collapsed')

      // Click to expand
      await trigger.click()
      await expect(sidebarWrapper).toHaveAttribute('data-state', 'expanded')
    })

    test('keyboard shortcut Ctrl+B toggles sidebar', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SidebarBasicDemo_"]').first()
      const sidebarWrapper = basicDemo.locator('[data-slot="sidebar-wrapper"]').first()

      await expect(sidebarWrapper).toHaveAttribute('data-state', 'expanded')

      // Press Ctrl+B to collapse
      await page.keyboard.press('Control+b')
      await expect(sidebarWrapper).toHaveAttribute('data-state', 'collapsed')

      // Press Ctrl+B to expand
      await page.keyboard.press('Control+b')
      await expect(sidebarWrapper).toHaveAttribute('data-state', 'expanded')
    })

    test('renders main content area', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="SidebarBasicDemo_"]').first()
      const inset = basicDemo.locator('[data-slot="sidebar-inset"]').first()
      await expect(inset).toBeVisible()
      await expect(inset).toContainText('Main content area')
    })
  })

  test.describe('Collapsible Groups', () => {
    test('renders collapsible menu groups', async ({ page }) => {
      const demo = page.locator('[bf-s^="SidebarCollapsibleGroupDemo_"]').first()
      await expect(demo).toBeVisible()

      // Platform group should be visible
      const dashboardButton = demo.locator('[data-slot="sidebar-menu-button"]:has-text("Dashboard")')
      await expect(dashboardButton).toBeVisible()
    })

    test('expands/collapses sub-items on click', async ({ page }) => {
      const demo = page.locator('[bf-s^="SidebarCollapsibleGroupDemo_"]').first()

      // Resources group starts collapsed — click to expand
      const resourcesButton = demo.locator('[data-slot="sidebar-menu-button"]:has-text("Resources")')
      await resourcesButton.click()

      // Sub-items should appear
      const docSubButton = demo.locator('[data-slot="sidebar-menu-sub-button"]:has-text("Documentation")')
      await expect(docSubButton).toBeVisible()
    })

    test('platform sub-items are initially visible', async ({ page }) => {
      const demo = page.locator('[bf-s^="SidebarCollapsibleGroupDemo_"]').first()

      // Platform starts open, so Overview should be visible
      const overviewSubButton = demo.locator('[data-slot="sidebar-menu-sub-button"]:has-text("Overview")')
      await expect(overviewSubButton).toBeVisible()
    })
  })

  test.describe('Floating Variant', () => {
    test('renders floating sidebar with menu items', async ({ page }) => {
      const demo = page.locator('[bf-s^="SidebarFloatingDemo_"]').first()
      await expect(demo).toBeVisible()

      const generalButton = demo.locator('[data-slot="sidebar-menu-button"]:has-text("general")')
      await expect(generalButton).toBeVisible()
    })

    test('renders menu badges', async ({ page }) => {
      const demo = page.locator('[bf-s^="SidebarFloatingDemo_"]').first()

      const badge = demo.locator('[data-slot="sidebar-menu-badge"]:has-text("12")')
      await expect(badge).toBeVisible()
    })

    test('floating sidebar has rounded corners', async ({ page }) => {
      const demo = page.locator('[bf-s^="SidebarFloatingDemo_"]').first()
      const inner = demo.locator('[data-slot="sidebar-inner"]').first()
      await expect(inner).toHaveClass(/rounded-lg/)
    })
  })
})
