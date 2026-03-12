import { test, expect } from '@playwright/test'

test.describe('Collapsible Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/collapsible')
  })

  test.describe('Basic Demo', () => {
    test('displays basic example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Basic")')).toBeVisible()
      const section = page.locator('[bf-s^="CollapsibleBasicDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('starts open by default (defaultOpen)', async ({ page }) => {
      const section = page.locator('[bf-s^="CollapsibleBasicDemo_"]:not([data-slot])').first()
      const collapsible = section.locator('[data-slot="collapsible"]')
      await expect(collapsible).toHaveAttribute('data-state', 'open')
    })

    test('content is visible when open', async ({ page }) => {
      const section = page.locator('[bf-s^="CollapsibleBasicDemo_"]:not([data-slot])').first()
      const content = section.locator('[data-slot="collapsible-content"]')
      await expect(content).toHaveAttribute('data-state', 'open')
      await expect(content).toHaveClass(/grid-rows-\[1fr\]/)
    })

    test('clicking trigger closes the content', async ({ page }) => {
      const section = page.locator('[bf-s^="CollapsibleBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="collapsible-trigger"]')
      const content = section.locator('[data-slot="collapsible-content"]')

      // Click to close
      await trigger.click()
      await expect(content).toHaveAttribute('data-state', 'closed')
      await expect(content).toHaveClass(/grid-rows-\[0fr\]/)
    })

    test('clicking trigger toggles open/closed', async ({ page }) => {
      const section = page.locator('[bf-s^="CollapsibleBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="collapsible-trigger"]')
      const content = section.locator('[data-slot="collapsible-content"]')

      // Close
      await trigger.click()
      await expect(content).toHaveAttribute('data-state', 'closed')

      // Open
      await trigger.click()
      await expect(content).toHaveAttribute('data-state', 'open')
    })

    test('trigger has aria-expanded attribute', async ({ page }) => {
      const section = page.locator('[bf-s^="CollapsibleBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="collapsible-trigger"]')

      // Open by default
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')

      // Close
      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })
  })

  test.describe('Controlled Demo', () => {
    test('displays controlled example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Controlled")')).toBeVisible()
      const section = page.locator('[bf-s^="CollapsibleControlledDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('starts closed', async ({ page }) => {
      const section = page.locator('[bf-s^="CollapsibleControlledDemo_"]:not([data-slot])').first()
      const content = section.locator('[data-slot="collapsible-content"]')
      await expect(content).toHaveAttribute('data-state', 'closed')
    })

    test('shows state label', async ({ page }) => {
      const section = page.locator('[bf-s^="CollapsibleControlledDemo_"]:not([data-slot])').first()
      await expect(section.locator('[data-testid="collapsible-controlled-state"]')).toContainText('closed')
    })

    test('clicking trigger opens and updates state label', async ({ page }) => {
      const section = page.locator('[bf-s^="CollapsibleControlledDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="collapsible-trigger"]')
      const content = section.locator('[data-slot="collapsible-content"]')

      await trigger.click()
      await expect(content).toHaveAttribute('data-state', 'open')
      await expect(section.locator('[data-testid="collapsible-controlled-state"]')).toContainText('open')
    })
  })

  test.describe('Disabled Demo', () => {
    test('displays disabled example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Disabled")')).toBeVisible()
      const section = page.locator('[bf-s^="CollapsibleDisabledDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('collapsible has data-disabled attribute', async ({ page }) => {
      const section = page.locator('[bf-s^="CollapsibleDisabledDemo_"]:not([data-slot])').first()
      const collapsible = section.locator('[data-slot="collapsible"]')
      await expect(collapsible).toHaveAttribute('data-disabled', '')
    })

    test('content stays closed when trigger is clicked', async ({ page }) => {
      const section = page.locator('[bf-s^="CollapsibleDisabledDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="collapsible-trigger"]')
      const content = section.locator('[data-slot="collapsible-content"]')

      await trigger.click({ force: true })
      await expect(content).toHaveAttribute('data-state', 'closed')
    })
  })

})
