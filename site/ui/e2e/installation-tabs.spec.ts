import { test, expect } from '@playwright/test'

test.describe('Installation Tabs (PackageManagerTabs)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/checkbox')
  })

  test('displays all package manager tabs', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    await expect(tablist).toBeVisible()
    // Use exact: true to avoid 'npm' matching 'pnpm'
    await expect(tablist.getByRole('tab', { name: 'bun' })).toBeVisible()
    await expect(tablist.getByRole('tab', { name: 'npm', exact: true })).toBeVisible()
    await expect(tablist.getByRole('tab', { name: 'pnpm' })).toBeVisible()
    await expect(tablist.getByRole('tab', { name: 'yarn' })).toBeVisible()
  })

  test('bun tab is selected by default', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    const bunTab = tablist.getByRole('tab', { name: 'bun' })
    await expect(bunTab).toHaveAttribute('aria-selected', 'true')
  })

  test('shows bun command by default', async ({ page }) => {
    await expect(page.locator('text=bunx --bun barefoot add checkbox')).toBeVisible()
  })

  test('clicking npm tab switches content', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    const npmTab = tablist.getByRole('tab', { name: 'npm', exact: true })

    await npmTab.click()

    await expect(npmTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('text=npx barefoot add checkbox')).toBeVisible()
  })

  test('clicking pnpm tab switches content', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    const pnpmTab = tablist.getByRole('tab', { name: 'pnpm' })

    await pnpmTab.click()

    await expect(pnpmTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('text=pnpm dlx barefoot add checkbox')).toBeVisible()
  })

  test('clicking yarn tab switches content', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    const yarnTab = tablist.getByRole('tab', { name: 'yarn' })

    await yarnTab.click()

    await expect(yarnTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('text=yarn dlx barefoot add checkbox')).toBeVisible()
  })

  test('switching tabs updates aria-selected correctly', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    const bunTab = tablist.getByRole('tab', { name: 'bun' })
    const npmTab = tablist.getByRole('tab', { name: 'npm', exact: true })
    const pnpmTab = tablist.getByRole('tab', { name: 'pnpm' })

    // Initial state
    await expect(bunTab).toHaveAttribute('aria-selected', 'true')
    await expect(npmTab).toHaveAttribute('aria-selected', 'false')

    // Switch to npm
    await npmTab.click()
    await expect(bunTab).toHaveAttribute('aria-selected', 'false')
    await expect(npmTab).toHaveAttribute('aria-selected', 'true')

    // Switch to pnpm
    await pnpmTab.click()
    await expect(npmTab).toHaveAttribute('aria-selected', 'false')
    await expect(pnpmTab).toHaveAttribute('aria-selected', 'true')

    // Switch back to bun
    await bunTab.click()
    await expect(pnpmTab).toHaveAttribute('aria-selected', 'false')
    await expect(bunTab).toHaveAttribute('aria-selected', 'true')
  })
})
