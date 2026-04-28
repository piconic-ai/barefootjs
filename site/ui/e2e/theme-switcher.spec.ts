import { test, expect } from '@playwright/test'

test.describe('ThemeSwitcher', () => {
  test.beforeEach(async ({ context, page }) => {
    // Clear theme cookie and any legacy localStorage value before each test
    await context.clearCookies()
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('theme'))
    await page.reload()
  })

  test('displays theme switcher in header', async ({ page }) => {
    await expect(page.locator('header button[aria-label*="mode"]')).toBeVisible()
  })

  test('uses system preference as default', async ({ page }) => {
    // The button should have aria-label that indicates current mode
    const themeSwitcher = page.locator('header button[aria-label*="mode"]')
    await expect(themeSwitcher).toBeVisible()

    // Aria-label should contain "Switch to" indicating toggle action
    const ariaLabel = await themeSwitcher.getAttribute('aria-label')
    expect(ariaLabel).toMatch(/Switch to (light|dark) mode/)
  })

  test('toggles between light and dark themes on click', async ({ page }) => {
    const themeSwitcher = page.locator('header button[aria-label*="mode"]')

    // Get initial state
    const initialLabel = await themeSwitcher.getAttribute('aria-label')
    const startedInLight = initialLabel?.includes('Switch to dark')

    if (startedInLight) {
      // Currently light, click to switch to dark
      await themeSwitcher.click()
      await expect(themeSwitcher).toHaveAttribute('aria-label', 'Switch to light mode')
      await expect(page.locator('html')).toHaveClass(/dark/)

      // Click again to switch back to light
      await themeSwitcher.click()
      await expect(themeSwitcher).toHaveAttribute('aria-label', 'Switch to dark mode')
      await expect(page.locator('html')).not.toHaveClass(/dark/)
    } else {
      // Currently dark, click to switch to light
      await themeSwitcher.click()
      await expect(themeSwitcher).toHaveAttribute('aria-label', 'Switch to dark mode')
      await expect(page.locator('html')).not.toHaveClass(/dark/)

      // Click again to switch back to dark
      await themeSwitcher.click()
      await expect(themeSwitcher).toHaveAttribute('aria-label', 'Switch to light mode')
      await expect(page.locator('html')).toHaveClass(/dark/)
    }
  })

  test('persists theme preference in cookie', async ({ context, page }) => {
    const themeSwitcher = page.locator('header button[aria-label*="mode"]')

    // Get initial state and click to switch
    const initialLabel = await themeSwitcher.getAttribute('aria-label')
    const startedInLight = initialLabel?.includes('Switch to dark')

    // Toggle to the opposite state
    await themeSwitcher.click()

    // Verify cookie has the new value
    const expectedTheme = startedInLight ? 'dark' : 'light'
    const cookies = await context.cookies()
    const themeCookie = cookies.find((c) => c.name === 'theme')
    expect(themeCookie?.value).toBe(expectedTheme)

    // Reload and verify persistence
    await page.reload()
    const expectedLabel = startedInLight ? 'Switch to light mode' : 'Switch to dark mode'
    await expect(themeSwitcher).toHaveAttribute('aria-label', expectedLabel)

    if (startedInLight) {
      await expect(page.locator('html')).toHaveClass(/dark/)
    } else {
      await expect(page.locator('html')).not.toHaveClass(/dark/)
    }
  })

  test('migrates legacy localStorage value to cookie on first load', async ({ context, page }) => {
    // Seed localStorage before any page script runs and ensure no cookie exists.
    await context.clearCookies()
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'dark')
    })
    await page.goto('/')

    // The init script should migrate to cookie and apply dark mode
    await expect(page.locator('html')).toHaveClass(/dark/)
    const cookies = await context.cookies()
    const themeCookie = cookies.find((c) => c.name === 'theme')
    expect(themeCookie?.value).toBe('dark')
  })

  test('icon stays 20x20 after toggle', async ({ page }) => {
    // Regression: site/ui re-exports a SunIcon / MoonIcon under
    // ui/components/ui/icon (lucide-style, no width/height when used
    // without a `size` prop). Without compiler-level scoping the local
    // ThemeSwitcher helpers of the same name collided in the global
    // component registry, and the swap rendered the lucide icon (no
    // size attrs) instead — sized to fill the 36px button.
    const themeSwitcher = page.locator('header button[aria-label*="mode"]')
    const initial = await themeSwitcher.locator('svg').boundingBox()
    expect(initial?.width).toBe(20)
    expect(initial?.height).toBe(20)
    await themeSwitcher.click()
    const afterToggle = await themeSwitcher.locator('svg').boundingBox()
    expect(afterToggle?.width).toBe(20)
    expect(afterToggle?.height).toBe(20)
  })

  test('header contains logo and UI link', async ({ page }) => {
    await expect(page.locator('header a:has(svg)').first()).toBeVisible()
    await expect(page.locator('header a:has-text("UI")')).toBeVisible()
    await expect(page.locator('header a:has-text("UI")')).toHaveAttribute('href', '/')
  })
})
