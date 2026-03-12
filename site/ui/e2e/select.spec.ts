import { test, expect } from '@playwright/test'

test.describe('Select Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/select')
  })

  test.describe('Basic Demo', () => {
    test('renders trigger with placeholder', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectBasicDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()

      const trigger = section.locator('[data-slot="select-trigger"]')
      await expect(trigger).toBeVisible()
      await expect(trigger.locator('[data-slot="select-value"]')).toContainText('Select a fruit...')
    })

    test('click opens dropdown', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      await expect(content).toBeVisible()
      await expect(content.locator('[data-slot="select-item"][data-value="apple"]')).toBeVisible()
      await expect(content.locator('[data-slot="select-item"][data-value="banana"]')).toBeVisible()
    })

    test('select item updates trigger label and closes dropdown', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      await content.locator('[data-slot="select-item"][data-value="apple"]').click()

      // Dropdown should close
      await expect(content).toHaveCount(0)

      // Trigger should show selected label
      await expect(trigger.locator('[data-slot="select-value"]')).toContainText('Apple')
    })

    test('disabled item cannot be selected', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      const disabledItem = content.locator('[data-slot="select-item"]').filter({ hasText: 'Blueberry' })
      await expect(disabledItem).toHaveAttribute('aria-disabled', 'true')

      // Click should not close the dropdown (pointer-events-none prevents click)
      // Verify dropdown is still open
      await expect(content).toBeVisible()
    })

    test('ESC closes dropdown', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      await expect(content).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(content).toHaveCount(0)
    })

    test('click outside closes dropdown', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      await expect(content).toBeVisible()

      await page.locator('h1').click()
      await expect(content).toHaveCount(0)
    })

    test('value display updates after selection', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')
      const valueText = section.locator('.selected-value')

      // Initially "None"
      await expect(valueText).toContainText('None')

      // Select Grape
      await trigger.click()
      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      await content.locator('[data-slot="select-item"]').filter({ hasText: 'Grape' }).click()

      await expect(valueText).toContainText('grape')
    })

    test('selected item shows check indicator', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')

      // Select Apple
      await trigger.click()
      let content = page.locator('[data-slot="select-content"][data-state="open"]')
      await content.locator('[data-slot="select-item"][data-value="apple"]').click()

      // Reopen to verify check indicator
      await trigger.click()
      content = page.locator('[data-slot="select-content"][data-state="open"]')
      const appleItem = content.locator('[data-slot="select-item"][data-value="apple"]')
      await expect(appleItem).toHaveAttribute('data-state', 'checked')
      await expect(appleItem).toHaveAttribute('aria-selected', 'true')
    })

    test('has correct ARIA roles', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')

      await expect(trigger).toHaveAttribute('role', 'combobox')
      await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')

      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      await expect(content).toHaveAttribute('role', 'listbox')

      const items = content.locator('[data-slot="select-item"]')
      await expect(items.first()).toHaveAttribute('role', 'option')
    })

    test('keyboard navigation with arrow keys', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      const items = content.locator('[data-slot="select-item"]:not([aria-disabled="true"])')

      // Wait for auto-focus on first item
      await expect(items.first()).toBeFocused()

      // Arrow down should focus next item
      await page.keyboard.press('ArrowDown')
      await expect(items.nth(1)).toBeFocused()

      // Arrow down again
      await page.keyboard.press('ArrowDown')
      await expect(items.nth(2)).toBeFocused()

      // Arrow up should go back
      await page.keyboard.press('ArrowUp')
      await expect(items.nth(1)).toBeFocused()
    })

    test('Enter key selects focused item', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      const items = content.locator('[data-slot="select-item"]:not([aria-disabled="true"])')

      // Wait for auto-focus on first item
      await expect(items.first()).toBeFocused()

      // Navigate to Banana (second item)
      await page.keyboard.press('ArrowDown')
      await expect(items.nth(1)).toBeFocused()

      // Press Enter to select
      await page.keyboard.press('Enter')

      // Dropdown should close and value should update
      await expect(content).toHaveCount(0)
      await expect(trigger.locator('[data-slot="select-value"]')).toContainText('Banana')
    })
  })

  test.describe('Form Demo', () => {
    test('displays three select fields', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectFormDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()

      const triggers = section.locator('[data-slot="select-trigger"]')
      await expect(triggers).toHaveCount(3)
    })

    test('shows initial summary', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectFormDemo_"]:not([data-slot])').first()
      await expect(section.locator('.summary-text')).toContainText('No selections yet')
    })

    test('selecting values updates summary', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectFormDemo_"]:not([data-slot])').first()
      const triggers = section.locator('[data-slot="select-trigger"]')
      const summaryText = section.locator('.summary-text')

      // Select framework (first trigger)
      await triggers.nth(0).click()
      let content = page.locator('[data-slot="select-content"][data-state="open"]')
      await content.locator('[data-slot="select-item"]').filter({ hasText: 'Next.js' }).click()

      await expect(summaryText).toContainText('Next.js')

      // Select role (second trigger)
      await triggers.nth(1).click()
      content = page.locator('[data-slot="select-content"][data-state="open"]')
      await content.locator('[data-slot="select-item"]').filter({ hasText: 'Frontend Developer' }).click()

      await expect(summaryText).toContainText('Frontend Developer')
      await expect(summaryText).toContainText('Next.js')
    })
  })

  test.describe('Grouped Demo', () => {
    test('group labels visible', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectGroupedDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()

      const trigger = section.locator('[data-slot="select-trigger"]')
      await trigger.click()

      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      await expect(content.locator('[data-slot="select-label"]').filter({ hasText: 'North America' })).toBeVisible()
      await expect(content.locator('[data-slot="select-label"]').filter({ hasText: 'Europe' })).toBeVisible()
      await expect(content.locator('[data-slot="select-label"]').filter({ hasText: 'Asia' })).toBeVisible()
    })

    test('separators present', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectGroupedDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      const separators = content.locator('[data-slot="select-separator"]')
      expect(await separators.count()).toBe(2)
    })

    test('selection from groups works', async ({ page }) => {
      const section = page.locator('[bf-s^="SelectGroupedDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="select-trigger"]')
      const valueText = section.locator('.selected-timezone')

      // Initially "None"
      await expect(valueText).toContainText('None')

      // Select JST from Asia group
      await trigger.click()
      const content = page.locator('[data-slot="select-content"][data-state="open"]')
      const jstItem = content.locator('[data-slot="select-item"]').filter({ hasText: 'Japan Standard Time' })
      await jstItem.scrollIntoViewIfNeeded()
      await jstItem.click()

      await expect(valueText).toContainText('jst')
      await expect(trigger.locator('[data-slot="select-value"]')).toContainText('Japan Standard Time')
    })
  })

})
