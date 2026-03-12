import { test, expect } from '@playwright/test'

test.describe('Switch Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/switch')
  })

  test.describe('Switch Rendering', () => {
    test('displays switch elements', async ({ page }) => {
      const switches = page.locator('button[role="switch"]')
      await expect(switches.first()).toBeVisible()
    })

    test('has multiple switch examples', async ({ page }) => {
      const switches = page.locator('button[role="switch"]')
      expect(await switches.count()).toBeGreaterThan(3)
    })
  })

  test.describe('Consent Demo', () => {
    test('displays consent demo with switch and button', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchConsentDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
      await expect(section.locator('button[role="switch"]')).toBeVisible()
      await expect(section.locator('button:has-text("Save preferences")')).toBeVisible()
    })

    test('button is disabled when unchecked', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchConsentDemo_"]:not([data-slot])').first()
      const button = section.locator('button:has-text("Save preferences")')
      await expect(button).toBeDisabled()
    })

    test('button enables when switch is checked', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchConsentDemo_"]:not([data-slot])').first()
      const switchBtn = section.locator('button[role="switch"]')
      const button = section.locator('button:has-text("Save preferences")')

      await switchBtn.click()
      await expect(button).toBeEnabled()
    })

    test('clicking label toggles switch', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchConsentDemo_"]:not([data-slot])').first()
      const switchBtn = section.locator('button[role="switch"]')
      const label = section.locator('text=Accept analytics cookies')

      // Initially unchecked
      await expect(switchBtn).toHaveAttribute('data-state', 'unchecked')

      // Click the label
      await label.click()

      // Switch should be checked
      await expect(switchBtn).toHaveAttribute('data-state', 'checked')
      await expect(switchBtn).toHaveAttribute('aria-checked', 'true')
    })
  })

  test.describe('Form', () => {
    test('displays form example with multiple switches', async ({ page }) => {
      await expect(page.locator('h3:has-text("Form")')).toBeVisible()
      const section = page.locator('[bf-s^="SwitchFormDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()

      // Should have 3 switches
      const switches = section.locator('button[role="switch"]')
      await expect(switches).toHaveCount(3)
    })

    test('shows notifications heading and description', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchFormDemo_"]:not([data-slot])').first()
      await expect(section.locator('h4:has-text("Notifications")')).toBeVisible()
      await expect(section.locator('text=Configure how you receive')).toBeVisible()
    })

    test('Push notifications is checked by default', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchFormDemo_"]:not([data-slot])').first()
      const switches = section.locator('button[role="switch"]')

      // Push notifications is the first switch
      const pushSwitch = switches.first()
      await expect(pushSwitch).toHaveAttribute('aria-checked', 'true')
    })

    test('shows enabled items', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchFormDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=Enabled:')).toBeVisible()
      await expect(section.locator('text=Push notifications').first()).toBeVisible()
    })

    test('updates enabled text when switches are toggled', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchFormDemo_"]:not([data-slot])').first()
      const switches = section.locator('button[role="switch"]')
      const enabledText = section.locator('text=/Enabled:/')

      // Click Email digest (second switch)
      await switches.nth(1).click()
      await expect(enabledText).toContainText('Push notifications')
      await expect(enabledText).toContainText('Email digest')
    })
  })

  test.describe('Notification Preferences', () => {
    test('displays notification preferences example', async ({ page }) => {
      await expect(page.locator('h3:has-text("Notification Preferences")')).toBeVisible()
      const section = page.locator('[bf-s^="SwitchNotificationDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()
    })

    test('shows enable all switch and items', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchNotificationDemo_"]:not([data-slot])').first()
      await expect(section.locator('text=Enable all')).toBeVisible()
      await expect(section.locator('text=Receive notifications via email')).toBeVisible()
    })

    test('can toggle individual channels', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchNotificationDemo_"]:not([data-slot])').first()
      const switches = section.locator('button[role="switch"]')

      // First switch is "enable all", second is first channel (Email)
      const emailSwitch = switches.nth(1)
      await emailSwitch.click()

      // Should show "1 enabled"
      await expect(section.locator('text=1 enabled')).toBeVisible()
    })

    test('enable all checks all channel switches', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchNotificationDemo_"]:not([data-slot])').first()
      const switches = section.locator('button[role="switch"]')

      // Click "Enable all" switch (first one)
      const enableAllSwitch = switches.first()
      await enableAllSwitch.click()

      // Should show "3 enabled"
      await expect(section.locator('text=3 enabled')).toBeVisible()

      // All 4 switches should be checked (enable all + 3 channels)
      for (let i = 0; i < 4; i++) {
        await expect(switches.nth(i)).toHaveAttribute('data-state', 'checked')
      }
    })
  })

  test.describe('Notification Preferences Detailed Behavior', () => {
    test('initial state: all unchecked, shows "Enable all"', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchNotificationDemo_"]:not([data-slot])').first()
      const switches = section.locator('button[role="switch"]')

      // All 4 switches unchecked
      for (let i = 0; i < 4; i++) {
        await expect(switches.nth(i)).toHaveAttribute('aria-checked', 'false')
      }
      // Shows "Enable all"
      await expect(section.locator('text=Enable all')).toBeVisible()
      await expect(section.locator('text=enabled')).not.toBeVisible()
    })

    test('selecting 1 channel shows "1 enabled"', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchNotificationDemo_"]:not([data-slot])').first()
      const switches = section.locator('button[role="switch"]')

      await switches.nth(1).click()
      await expect(section.locator('text=1 enabled')).toBeVisible()
    })

    test('selecting 2 channels shows "2 enabled"', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchNotificationDemo_"]:not([data-slot])').first()
      const switches = section.locator('button[role="switch"]')

      await switches.nth(1).click()
      await switches.nth(2).click()
      await expect(section.locator('text=2 enabled')).toBeVisible()
    })

    test('selecting all 3 channels shows "3 enabled" and checks "Enable all"', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchNotificationDemo_"]:not([data-slot])').first()
      const switches = section.locator('button[role="switch"]')

      await switches.nth(1).click()
      await switches.nth(2).click()
      await switches.nth(3).click()

      await expect(section.locator('text=3 enabled')).toBeVisible()
      await expect(switches.first()).toHaveAttribute('aria-checked', 'true') // Enable all
    })

    test('deselecting one channel updates count', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchNotificationDemo_"]:not([data-slot])').first()
      const switches = section.locator('button[role="switch"]')

      // Select 2
      await switches.nth(1).click()
      await switches.nth(2).click()
      await expect(section.locator('text=2 enabled')).toBeVisible()

      // Deselect 1
      await switches.nth(1).click()
      await expect(section.locator('text=1 enabled')).toBeVisible()
    })

    test('deselecting all returns to "Enable all"', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchNotificationDemo_"]:not([data-slot])').first()
      const switches = section.locator('button[role="switch"]')

      // Select 1, then deselect
      await switches.nth(1).click()
      await switches.nth(1).click()

      await expect(section.locator('text=Enable all')).toBeVisible()
    })

    test('clicking "Enable all" when partially selected selects all', async ({ page }) => {
      const section = page.locator('[bf-s^="SwitchNotificationDemo_"]:not([data-slot])').first()
      const switches = section.locator('button[role="switch"]')

      // Select 1 channel first
      await switches.nth(1).click()
      await expect(section.locator('text=1 enabled')).toBeVisible()

      // Click "Enable all"
      await switches.first().click()

      // All should be selected
      await expect(section.locator('text=3 enabled')).toBeVisible()
      for (let i = 0; i < 4; i++) {
        await expect(switches.nth(i)).toHaveAttribute('aria-checked', 'true')
      }
    })
  })

})
