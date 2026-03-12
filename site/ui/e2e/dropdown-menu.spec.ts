import { test, expect } from '@playwright/test'

test.describe('DropdownMenu Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/dropdown-menu')
  })

  test.describe('Basic Demo', () => {
    test('opens menu and shows items', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuBasicDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()
      await expect(content.locator('text=Copy')).toBeVisible()
      await expect(content.locator('text=Paste')).toBeVisible()
      await expect(content.locator('text=Delete')).toBeVisible()
    })

    test('has label and separators', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuBasicDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await expect(content.locator('[data-slot="dropdown-menu-label"]')).toContainText('Actions')
      expect(await content.locator('[data-slot="dropdown-menu-separator"]').count()).toBeGreaterThanOrEqual(1)
    })

    test('destructive item has correct styling', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuBasicDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const deleteItem = content.locator('[data-slot="dropdown-menu-item"]').filter({ hasText: 'Delete' })
      await expect(deleteItem).toHaveClass(/text-destructive/)
    })

    test('closes on item click', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuBasicDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await content.locator('[data-slot="dropdown-menu-item"]').filter({ hasText: 'Copy' }).click()

      await expect(content).toHaveCount(0)
    })

    test('closes on ESC', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuBasicDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(content).toHaveCount(0)
    })
  })

  test.describe('Checkbox Demo', () => {
    test('opens menu and shows checkbox items', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuCheckboxDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()

      const checkboxItems = content.locator('[role="menuitemcheckbox"]')
      expect(await checkboxItems.count()).toBe(2)
    })

    test('toggles checkbox on click', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuCheckboxDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const statusItem = content.locator('[role="menuitemcheckbox"]').filter({ hasText: 'Status Bar' })

      // Initially checked
      await expect(statusItem).toHaveAttribute('aria-checked', 'true')

      // Click to uncheck
      await statusItem.click()
      await expect(statusItem).toHaveAttribute('aria-checked', 'false')

      // Menu should still be open
      await expect(content).toBeVisible()
    })

    test('checkbox item does not close menu', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuCheckboxDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const activityItem = content.locator('[role="menuitemcheckbox"]').filter({ hasText: 'Activity Panel' })

      // Initially unchecked
      await expect(activityItem).toHaveAttribute('aria-checked', 'false')

      // Click to check
      await activityItem.click()
      await expect(activityItem).toHaveAttribute('aria-checked', 'true')

      // Menu should still be open
      await expect(content).toBeVisible()
    })
  })

  test.describe('Profile Menu Demo', () => {
    // Content is portaled to body, so use page-level locator after trigger click.
    // Only one menu is open at a time, so [data-state="open"] uniquely identifies it.

    test('opens menu when avatar trigger is clicked', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()
      await expect(content.locator('text=Settings')).toBeVisible()
    })

    test('has correct ARIA roles', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await trigger.click()

      await expect(trigger).toHaveAttribute('aria-expanded', 'true')

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await expect(content).toHaveAttribute('role', 'menu')

      const items = content.locator('[role="menuitem"]')
      expect(await items.count()).toBeGreaterThan(0)
    })

    test('displays menu label', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const label = content.locator('[data-slot="dropdown-menu-label"]')
      await expect(label).toContainText('My Account')
    })

    test('displays separators', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const separators = content.locator('[data-slot="dropdown-menu-separator"]')
      expect(await separators.count()).toBeGreaterThanOrEqual(2)
    })

    test('displays keyboard shortcut', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const shortcut = content.locator('[data-slot="dropdown-menu-shortcut"]')
      await expect(shortcut.first()).toBeVisible()
    })

    test('closes on ESC', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const openContent = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await expect(openContent).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(openContent).toHaveCount(0)
    })

    test('closes on click outside', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const openContent = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await expect(openContent).toBeVisible()

      // Click outside the menu (on the page header)
      await page.locator('h1').click()
      await expect(openContent).toHaveCount(0)
    })

    test('closes on item click', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const openContent = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      // Click Settings (a regular menuitem, not checkbox/radio)
      const settingsItem = openContent.locator('[data-slot="dropdown-menu-item"][role="menuitem"]:not([data-sub-trigger])').filter({ hasText: 'Settings' })
      await settingsItem.click()

      await expect(openContent).toHaveCount(0)
    })

    test('keyboard navigation with arrow keys', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await content.focus()

      // Arrow down should focus first item
      await page.keyboard.press('ArrowDown')
      const firstItem = content.locator('[data-slot="dropdown-menu-item"]').first()
      await expect(firstItem).toBeFocused()

      // Arrow down again should focus second item
      await page.keyboard.press('ArrowDown')
      const secondItem = content.locator('[data-slot="dropdown-menu-item"]').nth(1)
      await expect(secondItem).toBeFocused()

      // Arrow up should go back to first item
      await page.keyboard.press('ArrowUp')
      await expect(firstItem).toBeFocused()
    })

    test('Home/End key navigation', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await content.focus()

      // End should focus last item
      await page.keyboard.press('End')
      const items = content.locator('[data-slot="dropdown-menu-item"]')
      const lastItem = items.last()
      await expect(lastItem).toBeFocused()

      // Home should focus first item
      await page.keyboard.press('Home')
      const firstItem = items.first()
      await expect(firstItem).toBeFocused()
    })
  })

  test.describe('Submenu', () => {
    test('opens submenu on hover', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')
      await expect(subTrigger).toBeVisible()

      // Hover over sub trigger
      await subTrigger.hover()

      // Wait for submenu to open (100ms delay + buffer)
      const subContent = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      // Submenu should contain language options
      await expect(subContent.locator('text=English')).toBeVisible()
      await expect(subContent.locator('text=Japanese')).toBeVisible()
      await expect(subContent.locator('text=French')).toBeVisible()
    })

    test('opens submenu with ArrowRight key', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')

      // Focus the sub trigger
      await subTrigger.focus()
      await page.keyboard.press('ArrowRight')

      const subContent = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })
    })

    test('closes submenu with ArrowLeft key', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')

      // Open submenu
      await subTrigger.hover()
      const subContent = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      // Focus a sub item and press ArrowLeft
      const subItem = subContent.locator('[data-slot="dropdown-menu-item"]').first()
      await subItem.focus()
      await page.keyboard.press('ArrowLeft')

      // Submenu should close
      await expect(subContent).toHaveCount(0)

      // Focus should return to sub trigger
      await expect(subTrigger).toBeFocused()
    })

    test('ESC closes only submenu, not parent menu', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')

      // Open submenu
      await subTrigger.hover()
      const subContent = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      // Focus a sub item and press ESC
      const subItem = subContent.locator('[data-slot="dropdown-menu-item"]').first()
      await subItem.focus()
      await page.keyboard.press('Escape')

      // Submenu should close
      await expect(subContent).toHaveCount(0)

      // Parent menu should remain open
      await expect(content).toBeVisible()
    })

    test('sub trigger has chevron icon and aria attributes', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')

      await expect(subTrigger).toHaveAttribute('aria-haspopup', 'menu')
      await expect(subTrigger).toHaveAttribute('aria-expanded', 'false')

      // Should contain a chevron SVG (last svg is the chevron icon)
      await expect(subTrigger.locator('svg').last()).toBeVisible()
    })
  })

  test.describe('Checkbox Items (Profile)', () => {
    test('toggles checkbox item on click', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const checkboxItems = content.locator('[role="menuitemcheckbox"]')
      expect(await checkboxItems.count()).toBe(2)

      // "Show Bookmarks Bar" should be initially checked
      const bookmarksItem = checkboxItems.filter({ hasText: 'Show Bookmarks Bar' })
      await expect(bookmarksItem).toHaveAttribute('aria-checked', 'true')

      // Click to uncheck
      await bookmarksItem.click()
      await expect(bookmarksItem).toHaveAttribute('aria-checked', 'false')

      // Menu should still be open (checkbox doesn't close menu)
      await expect(content).toBeVisible()
    })

    test('checkbox item does not close menu', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const toolbarItem = content.locator('[role="menuitemcheckbox"]').filter({ hasText: 'Show Toolbar' })

      // "Show Toolbar" should be initially unchecked
      await expect(toolbarItem).toHaveAttribute('aria-checked', 'false')

      // Click to check
      await toolbarItem.click()
      await expect(toolbarItem).toHaveAttribute('aria-checked', 'true')

      // Menu should still be open
      await expect(content).toBeVisible()
    })
  })

  test.describe('Radio Items', () => {
    test('selects radio item on click', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      // Open submenu to access radio items
      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')
      await subTrigger.hover()

      const subContent = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      const radioItems = subContent.locator('[role="menuitemradio"]')
      expect(await radioItems.count()).toBe(3)

      // "English" should be initially selected
      const englishItem = radioItems.filter({ hasText: 'English' })
      await expect(englishItem).toHaveAttribute('aria-checked', 'true')

      // Click "Japanese" to select
      const japaneseItem = radioItems.filter({ hasText: 'Japanese' })
      await japaneseItem.click()
      await expect(japaneseItem).toHaveAttribute('aria-checked', 'true')

      // "English" should now be deselected
      await expect(englishItem).toHaveAttribute('aria-checked', 'false')
    })

    test('radio items are mutually exclusive', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')
      await subTrigger.hover()

      const subContent = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      const radioItems = subContent.locator('[role="menuitemradio"]')

      // Click French
      const frenchItem = radioItems.filter({ hasText: 'French' })
      await frenchItem.click()

      // Only French should be checked
      const checkedItems = subContent.locator('[role="menuitemradio"][aria-checked="true"]')
      expect(await checkedItems.count()).toBe(1)
      await expect(frenchItem).toHaveAttribute('aria-checked', 'true')
    })

    test('radio item does not close menu', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')
      await subTrigger.hover()

      const subContent = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      const japaneseItem = subContent.locator('[role="menuitemradio"]').filter({ hasText: 'Japanese' })
      await japaneseItem.click()

      // Submenu should still be open
      await expect(subContent).toBeVisible()
      // Parent menu should still be open
      await expect(content).toBeVisible()
    })
  })

  test.describe('Destructive Variant', () => {
    test('destructive item has correct styling class', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const logoutItem = content.locator('[data-slot="dropdown-menu-item"]').filter({ hasText: 'Log out' })

      // Should have text-destructive class
      await expect(logoutItem).toHaveClass(/text-destructive/)
    })

    test('destructive item closes menu on click', async ({ page }) => {
      const demo = page.locator('[bf-s^="DropdownMenuProfileDemo_"]').first()
      const trigger = demo.locator('[data-slot="dropdown-menu-trigger"]')

      await trigger.click()

      const content = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      const logoutItem = content.locator('[data-slot="dropdown-menu-item"]').filter({ hasText: 'Log out' })

      await logoutItem.click()

      // Menu should close
      await expect(content).toHaveCount(0)
    })
  })

})
