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
    await expect(tablist.getByRole('tab', { name: 'deno' })).toBeVisible()
  })

  test('npm tab is selected by default', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    const npmTab = tablist.getByRole('tab', { name: 'npm', exact: true })
    await expect(npmTab).toHaveAttribute('aria-selected', 'true')
  })

  test('shows npm command by default', async ({ page }) => {
    await expect(page.locator('text=npx @barefootjs/cli add checkbox')).toBeVisible()
  })

  test('clicking bun tab switches content', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    const bunTab = tablist.getByRole('tab', { name: 'bun' })

    await bunTab.click()

    await expect(bunTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('text=bunx --bun @barefootjs/cli add checkbox')).toBeVisible()
  })

  test('clicking pnpm tab switches content', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    const pnpmTab = tablist.getByRole('tab', { name: 'pnpm' })

    await pnpmTab.click()

    await expect(pnpmTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('text=pnpm dlx @barefootjs/cli add checkbox')).toBeVisible()
  })

  test('clicking yarn tab switches content', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    const yarnTab = tablist.getByRole('tab', { name: 'yarn' })

    await yarnTab.click()

    await expect(yarnTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('text=yarn dlx @barefootjs/cli add checkbox')).toBeVisible()
  })

  test('clicking deno tab switches content', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    const denoTab = tablist.getByRole('tab', { name: 'deno' })

    await denoTab.click()

    await expect(denoTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('text=deno x npm:@barefootjs/cli add checkbox')).toBeVisible()
  })

  test('switching tabs updates aria-selected correctly', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]').first()
    const npmTab = tablist.getByRole('tab', { name: 'npm', exact: true })
    const bunTab = tablist.getByRole('tab', { name: 'bun' })
    const pnpmTab = tablist.getByRole('tab', { name: 'pnpm' })

    // Initial state
    await expect(npmTab).toHaveAttribute('aria-selected', 'true')
    await expect(bunTab).toHaveAttribute('aria-selected', 'false')

    // Switch to bun
    await bunTab.click()
    await expect(npmTab).toHaveAttribute('aria-selected', 'false')
    await expect(bunTab).toHaveAttribute('aria-selected', 'true')

    // Switch to pnpm
    await pnpmTab.click()
    await expect(bunTab).toHaveAttribute('aria-selected', 'false')
    await expect(pnpmTab).toHaveAttribute('aria-selected', 'true')

    // Switch back to npm
    await npmTab.click()
    await expect(pnpmTab).toHaveAttribute('aria-selected', 'false')
    await expect(npmTab).toHaveAttribute('aria-selected', 'true')
  })
})
