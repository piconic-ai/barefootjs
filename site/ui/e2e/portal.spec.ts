import { test, expect } from '@playwright/test'

test.describe('Portal Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/portal')
  })

  test.describe('Basic Portal', () => {
    test('shows portal content when button clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="PortalBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Show Portal")')

      await trigger.click()

      // Portal content renders at document.body, so look globally
      const portalContent = page.locator('[data-portal-content]')
      await expect(portalContent).toBeVisible()
      await expect(portalContent).toContainText('Portal content at document.body')
    })

    test('hides portal when close clicked', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="PortalBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Show Portal")')

      await trigger.click()

      const portalContent = page.locator('[data-portal-content]')
      await expect(portalContent).toBeVisible()

      // Click close button inside portal
      const closeButton = page.locator('[data-portal-close]')
      await closeButton.click()

      await expect(portalContent).not.toBeVisible()
    })

    test('portal renders outside demo scope', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="PortalBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Show Portal")')

      await trigger.click()

      // Verify portal content is NOT inside the demo scope
      const portalInsideDemo = basicDemo.locator('[data-portal-content]')
      await expect(portalInsideDemo).toHaveCount(0)

      // But exists globally
      const portalGlobal = page.locator('[data-portal-content]')
      await expect(portalGlobal).toBeVisible()
    })

    test('disables button while portal is open', async ({ page }) => {
      const basicDemo = page.locator('[bf-s^="PortalBasicDemo_"]').first()
      const trigger = basicDemo.locator('button:has-text("Show Portal")')

      // Initially enabled
      await expect(trigger).not.toBeDisabled()

      await trigger.click()

      // Should be disabled while portal is open
      await expect(trigger).toBeDisabled()

      // Close the portal
      const closeButton = page.locator('[data-portal-close]')
      await closeButton.click()

      // Should be enabled again
      await expect(trigger).not.toBeDisabled()
    })
  })

  test.describe('Custom Container Portal', () => {
    test('renders portal inside custom container', async ({ page }) => {
      const containerDemo = page.locator('[bf-s^="PortalCustomContainerDemo_"]').first()
      const trigger = containerDemo.locator('button:has-text("Show in Container")')
      const container = containerDemo.locator('[data-portal-container]')

      await trigger.click()

      // Portal should be inside the custom container
      const portalContent = container.locator('[data-portal-content]')
      await expect(portalContent).toBeVisible()
      await expect(portalContent).toContainText('Rendered inside custom container')
    })

    test('hides portal on hide button click', async ({ page }) => {
      const containerDemo = page.locator('[bf-s^="PortalCustomContainerDemo_"]').first()
      const showTrigger = containerDemo.locator('button:has-text("Show in Container")')
      const hideTrigger = containerDemo.locator('button:has-text("Hide")')

      await showTrigger.click()

      const portalContent = containerDemo.locator('[data-portal-content]')
      await expect(portalContent).toBeVisible()

      await hideTrigger.click()
      await expect(portalContent).not.toBeVisible()
    })

    test('hide button is disabled when portal is not visible', async ({ page }) => {
      const containerDemo = page.locator('[bf-s^="PortalCustomContainerDemo_"]').first()
      const showTrigger = containerDemo.locator('button:has-text("Show in Container")')
      const hideTrigger = containerDemo.locator('button:has-text("Hide")')

      // Initially hide button should be disabled
      await expect(hideTrigger).toBeDisabled()

      await showTrigger.click()

      // Now hide button should be enabled
      await expect(hideTrigger).not.toBeDisabled()
    })
  })

})
