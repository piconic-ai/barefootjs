import { test, expect } from '@playwright/test'

test.describe('Combobox Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/combobox')
  })

  test.describe('Basic Demo', () => {
    test('renders trigger with placeholder', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()

      const trigger = section.locator('[data-slot="combobox-trigger"]')
      await expect(trigger).toBeVisible()
      await expect(trigger.locator('[data-slot="combobox-value"]')).toContainText('Select framework...')
    })

    // TODO: Combobox open/close reactivity not working after hydration — context signal chain broken
    test.skip('click opens dropdown', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      await expect(content).toBeVisible()
      await expect(content.locator('[data-slot="combobox-item"][data-value="next"]')).toBeVisible()
      await expect(content.locator('[data-slot="combobox-item"][data-value="svelte"]')).toBeVisible()
    })

    test.skip('select item updates trigger label and closes dropdown', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      await content.locator('[data-slot="combobox-item"][data-value="next"]').click()

      // Dropdown should close
      await expect(content).toHaveCount(0)

      // Trigger should show selected label
      await expect(trigger.locator('[data-slot="combobox-value"]')).toContainText('Next.js')
    })

    test.skip('ESC closes dropdown', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      await expect(content).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(content).toHaveCount(0)
    })

    test.skip('click outside closes dropdown', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      await expect(content).toBeVisible()

      await page.locator('h1').click()
      await expect(content).toHaveCount(0)
    })

    test.skip('value display updates after selection', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')
      const valueText = section.locator('.selected-value')

      // Initially "None"
      await expect(valueText).toContainText('None')

      // Select Nuxt
      await trigger.click()
      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      await content.locator('[data-slot="combobox-item"]').filter({ hasText: 'Nuxt' }).click()

      await expect(valueText).toContainText('nuxt')
    })

    test.skip('selected item shows check indicator', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      // Select Next.js
      await trigger.click()
      let content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      await content.locator('[data-slot="combobox-item"][data-value="next"]').click()

      // Reopen to verify check indicator
      await trigger.click()
      content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      const nextItem = content.locator('[data-slot="combobox-item"][data-value="next"]')
      await expect(nextItem).toHaveAttribute('data-state', 'checked')
      await expect(nextItem).toHaveAttribute('aria-selected', 'true')
    })

    test.skip('has correct ARIA roles', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await expect(trigger).toHaveAttribute('role', 'combobox')
      await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      await expect(content).toHaveAttribute('role', 'listbox')

      const items = content.locator('[data-slot="combobox-item"]')
      await expect(items.first()).toHaveAttribute('role', 'option')
    })

    test.skip('search filters items', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      const input = content.locator('[data-slot="combobox-input"]')

      // All items visible initially
      const allItems = content.locator('[data-slot="combobox-item"]')
      await expect(allItems).toHaveCount(5)

      // Type "next" to filter
      await input.fill('next')

      // Only Next.js should be visible
      const visibleItems = content.locator('[data-slot="combobox-item"]:not([hidden])')
      await expect(visibleItems).toHaveCount(1)
      await expect(visibleItems.first()).toContainText('Next.js')
    })

    test.skip('empty state shows when no items match', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      const input = content.locator('[data-slot="combobox-input"]')

      // Type something that matches nothing
      await input.fill('zzzzz')

      const empty = content.locator('[data-slot="combobox-empty"]:not([hidden])')
      await expect(empty).toBeVisible()
      await expect(empty).toContainText('No framework found.')
    })

    test.skip('keyboard navigation with arrow keys', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      const items = content.locator('[data-slot="combobox-item"]:not([hidden])')

      // First item should be auto-selected
      await expect(items.first()).toHaveAttribute('data-selected', 'true')

      // Arrow down should select next item
      await page.keyboard.press('ArrowDown')
      await expect(items.nth(0)).toHaveAttribute('data-selected', 'false')
      await expect(items.nth(1)).toHaveAttribute('data-selected', 'true')

      // Arrow down again
      await page.keyboard.press('ArrowDown')
      await expect(items.nth(1)).toHaveAttribute('data-selected', 'false')
      await expect(items.nth(2)).toHaveAttribute('data-selected', 'true')

      // Arrow up should go back
      await page.keyboard.press('ArrowUp')
      await expect(items.nth(2)).toHaveAttribute('data-selected', 'false')
      await expect(items.nth(1)).toHaveAttribute('data-selected', 'true')
    })

    test.skip('Enter key selects highlighted item', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')

      // Navigate to SvelteKit (second item)
      await page.keyboard.press('ArrowDown')

      // Press Enter to select
      await page.keyboard.press('Enter')

      // Dropdown should close and value should update
      await expect(content).toHaveCount(0)
      await expect(trigger.locator('[data-slot="combobox-value"]')).toContainText('SvelteKit')
    })

    test.skip('search is cleared after selection', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxBasicDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await trigger.click()

      let content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      const input = content.locator('[data-slot="combobox-input"]')

      // Type to filter
      await input.fill('nuxt')

      // Select the filtered item
      const visibleItems = content.locator('[data-slot="combobox-item"]:not([hidden])')
      await visibleItems.first().click()

      // Reopen
      await trigger.click()
      content = page.locator('[data-slot="combobox-content"][data-state="open"]')

      // Search should be cleared, all items visible
      const allItems = content.locator('[data-slot="combobox-item"]:not([hidden])')
      await expect(allItems).toHaveCount(5)
    })
  })

  test.describe('Form Demo', () => {
    test('displays two combobox fields', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxFormDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()

      const triggers = section.locator('[data-slot="combobox-trigger"]')
      await expect(triggers).toHaveCount(2)
    })

    test('shows initial summary', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxFormDemo_"]:not([data-slot])').first()
      await expect(section.locator('.summary-text')).toContainText('No selections yet')
    })

    test.skip('selecting values updates summary', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxFormDemo_"]:not([data-slot])').first()
      const triggers = section.locator('[data-slot="combobox-trigger"]')
      const summaryText = section.locator('.summary-text')

      // Select language (first trigger)
      await triggers.nth(0).click()
      let content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      await content.locator('[data-slot="combobox-item"]').filter({ hasText: 'TypeScript' }).click()

      await expect(summaryText).toContainText('TypeScript')

      // Select framework (second trigger)
      await triggers.nth(1).click()
      content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      await content.locator('[data-slot="combobox-item"]').filter({ hasText: 'Hono' }).click()

      await expect(summaryText).toContainText('TypeScript')
      await expect(summaryText).toContainText('Hono')
    })
  })

  test.describe('Grouped Demo', () => {
    test.skip('group headings visible', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxGroupedDemo_"]:not([data-slot])').first()
      await expect(section).toBeVisible()

      const trigger = section.locator('[data-slot="combobox-trigger"]')
      await trigger.click()

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      await expect(content.locator('[data-slot="combobox-group-heading"]').filter({ hasText: 'North America' })).toBeVisible()
      await expect(content.locator('[data-slot="combobox-group-heading"]').filter({ hasText: 'Europe' })).toBeVisible()
      await expect(content.locator('[data-slot="combobox-group-heading"]').filter({ hasText: 'Asia' })).toBeVisible()
    })

    test.skip('separators present', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxGroupedDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      const separators = content.locator('[data-slot="combobox-separator"]')
      expect(await separators.count()).toBe(2)
    })

    test.skip('selection from groups works', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxGroupedDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')
      const valueText = section.locator('.selected-timezone')

      // Initially "None"
      await expect(valueText).toContainText('None')

      // Select JST from Asia group
      await trigger.click()
      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      const jstItem = content.locator('[data-slot="combobox-item"]').filter({ hasText: 'Japan Standard Time' })
      await jstItem.scrollIntoViewIfNeeded()
      await jstItem.click()

      await expect(valueText).toContainText('jst')
      await expect(trigger.locator('[data-slot="combobox-value"]')).toContainText('Japan Standard Time')
    })

    test.skip('search filters across groups', async ({ page }) => {
      const section = page.locator('[bf-s^="ComboboxGroupedDemo_"]:not([data-slot])').first()
      const trigger = section.locator('[data-slot="combobox-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="combobox-content"][data-state="open"]')
      const input = content.locator('[data-slot="combobox-input"]')

      // Type "eastern" to filter
      await input.fill('eastern')

      // Should match EST and EET
      const visibleItems = content.locator('[data-slot="combobox-item"]:not([hidden])')
      await expect(visibleItems).toHaveCount(2)

      // Groups without visible items should be hidden
      const visibleGroups = content.locator('[data-slot="combobox-group"]:not([hidden])')
      await expect(visibleGroups).toHaveCount(2) // North America and Europe
    })
  })
})
