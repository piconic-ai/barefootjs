import { test, expect } from '@playwright/test'

test.describe('Menubar Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/menubar')
  })

  test.describe('Basic Demo', () => {
    test('opens menu on trigger click', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarBasicDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: 'File' })

      await fileTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      await expect(content).toBeVisible()
      await expect(content.locator('text=New Tab')).toBeVisible()
      await expect(content.locator('text=New Window')).toBeVisible()
      await expect(content.locator('text=Print')).toBeVisible()
    })

    test('has ARIA attributes on trigger', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarBasicDemo_"]').first()
      const trigger = menubar.locator('[data-slot="menubar-trigger"]').first()

      await expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    test('closes menu on item click', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarBasicDemo_"]').first()
      const trigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: 'File' })

      await trigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      await content.locator('[data-slot="menubar-item"]').filter({ hasText: 'New Tab' }).click()

      await expect(content).toHaveCount(0)
    })

    test('closes menu on ESC', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarBasicDemo_"]').first()
      const trigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: 'File' })

      await trigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      await expect(content).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(content).toHaveCount(0)
    })

    test('closes menu on click outside', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarBasicDemo_"]').first()
      const trigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: 'File' })

      await trigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      await expect(content).toBeVisible()

      await page.locator('h1').click()
      await expect(content).toHaveCount(0)
    })

    test('displays keyboard shortcuts', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarBasicDemo_"]').first()
      const trigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: 'File' })

      await trigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const shortcuts = content.locator('[data-slot="menubar-shortcut"]')
      expect(await shortcuts.count()).toBeGreaterThan(0)
    })
  })

  test.describe('Menu Roving', () => {
    // Use the Application demo (first MenubarApplicationDemo on page = preview)
    test('hover opens adjacent menu when one is already open', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })
      const editTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^Edit$/ })

      // Open File menu
      await fileTrigger.click()
      const fileContent = page.locator('[data-slot="menubar-content"][data-state="open"]')
      await expect(fileContent).toBeVisible()
      await expect(fileContent.locator('text=New Tab')).toBeVisible()

      // Hover Edit trigger should open Edit menu
      await editTrigger.hover()
      await expect(page.locator('[data-slot="menubar-content"][data-state="open"]').locator('text=Undo')).toBeVisible()
    })

    test('ArrowRight on trigger navigates to next trigger', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })
      const editTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^Edit$/ })

      await fileTrigger.focus()
      await page.keyboard.press('ArrowRight')
      await expect(editTrigger).toBeFocused()
    })

    test('ArrowLeft on trigger navigates to previous trigger', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })
      const editTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^Edit$/ })

      await editTrigger.focus()
      await page.keyboard.press('ArrowLeft')
      await expect(fileTrigger).toBeFocused()
    })

    test('ArrowRight in content navigates to next menu trigger', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })

      // Open File menu and focus content
      await fileTrigger.click()
      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      await content.focus()

      // ArrowDown to focus first non-subtrigger item, then ArrowRight navigates to Edit
      await page.keyboard.press('ArrowDown')

      // ArrowRight should move to Edit menu (focused item is not a sub-trigger)
      await page.keyboard.press('ArrowRight')

      // Edit menu should now be open
      const editContent = page.locator('[data-slot="menubar-content"][data-state="open"]')
      await expect(editContent.locator('text=Undo')).toBeVisible()
    })

    test('ArrowLeft in content navigates to previous menu trigger', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const editTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^Edit$/ })

      // Open Edit menu
      await editTrigger.click()
      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      await content.focus()
      await page.keyboard.press('ArrowDown')

      // ArrowLeft should move to File menu
      await page.keyboard.press('ArrowLeft')

      const fileContent = page.locator('[data-slot="menubar-content"][data-state="open"]')
      await expect(fileContent.locator('text=New Tab')).toBeVisible()
    })
  })

  test.describe('Keyboard Navigation within Content', () => {
    test('ArrowDown/Up navigates items', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })

      await fileTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      await content.focus()

      // ArrowDown focuses first item
      await page.keyboard.press('ArrowDown')
      const firstItem = content.locator('[data-slot="menubar-item"]').first()
      await expect(firstItem).toBeFocused()

      // ArrowDown again focuses second item
      await page.keyboard.press('ArrowDown')
      const secondItem = content.locator('[data-slot="menubar-item"]').nth(1)
      await expect(secondItem).toBeFocused()

      // ArrowUp goes back
      await page.keyboard.press('ArrowUp')
      await expect(firstItem).toBeFocused()
    })

    test('Home/End key navigation', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })

      await fileTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      await content.focus()

      // End focuses last item
      await page.keyboard.press('End')
      const items = content.locator('[data-slot="menubar-item"]')
      const lastItem = items.last()
      await expect(lastItem).toBeFocused()

      // Home focuses first item
      await page.keyboard.press('Home')
      const firstItem = items.first()
      await expect(firstItem).toBeFocused()
    })
  })

  test.describe('Checkbox Items', () => {
    test('toggles checkbox on click', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const viewTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^View$/ })

      await viewTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const bookmarksItem = content.locator('[role="menuitemcheckbox"]').filter({ hasText: 'Always Show Bookmarks Bar' })

      // Initially checked
      await expect(bookmarksItem).toHaveAttribute('aria-checked', 'true')

      // Click to uncheck
      await bookmarksItem.click()
      await expect(bookmarksItem).toHaveAttribute('aria-checked', 'false')

      // Menu should still be open
      await expect(content).toBeVisible()
    })

    test('checkbox item does not close menu', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const viewTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^View$/ })

      await viewTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const urlsItem = content.locator('[role="menuitemcheckbox"]').filter({ hasText: 'Always Show Full URLs' })

      // Initially unchecked
      await expect(urlsItem).toHaveAttribute('aria-checked', 'false')

      // Click to check
      await urlsItem.click()
      await expect(urlsItem).toHaveAttribute('aria-checked', 'true')

      // Menu stays open
      await expect(content).toBeVisible()
    })
  })

  test.describe('Radio Items', () => {
    test('selects radio item on click', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const profilesTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^Profiles$/ })

      await profilesTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const radioItems = content.locator('[role="menuitemradio"]')
      expect(await radioItems.count()).toBe(3)

      // "Benoit" should be initially selected
      const benoitItem = radioItems.filter({ hasText: 'Benoit' })
      await expect(benoitItem).toHaveAttribute('aria-checked', 'true')

      // Click "Andy" to select
      const andyItem = radioItems.filter({ hasText: 'Andy' })
      await andyItem.click()
      await expect(andyItem).toHaveAttribute('aria-checked', 'true')

      // "Benoit" should now be deselected
      await expect(benoitItem).toHaveAttribute('aria-checked', 'false')
    })

    test('radio items are mutually exclusive', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const profilesTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^Profiles$/ })

      await profilesTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const luisItem = content.locator('[role="menuitemradio"]').filter({ hasText: 'Luis' })
      await luisItem.click()

      // Only Luis should be checked
      const checkedItems = content.locator('[role="menuitemradio"][aria-checked="true"]')
      expect(await checkedItems.count()).toBe(1)
      await expect(luisItem).toHaveAttribute('aria-checked', 'true')
    })

    test('radio item does not close menu', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const profilesTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^Profiles$/ })

      await profilesTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const andyItem = content.locator('[role="menuitemradio"]').filter({ hasText: 'Andy' })
      await andyItem.click()

      // Menu should still be open
      await expect(content).toBeVisible()
    })
  })

  test.describe('Submenus', () => {
    test('opens submenu on hover', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })

      await fileTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]').first()
      await expect(subTrigger).toBeVisible()

      await subTrigger.hover()

      const subContent = page.locator('[data-slot="menubar-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      await expect(subContent.locator('text=Email')).toBeVisible()
      await expect(subContent.locator('text=Messages')).toBeVisible()
      await expect(subContent.locator('text=Notes')).toBeVisible()
    })

    test('opens submenu with ArrowRight key', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })

      await fileTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]').first()

      await subTrigger.focus()
      await page.keyboard.press('ArrowRight')

      const subContent = page.locator('[data-slot="menubar-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })
    })

    test('closes submenu with ArrowLeft key', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })

      await fileTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]').first()

      // Open submenu
      await subTrigger.hover()
      const subContent = page.locator('[data-slot="menubar-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      // Focus a sub item and press ArrowLeft
      const subItem = subContent.locator('[data-slot="menubar-item"]').first()
      await subItem.focus()
      await page.keyboard.press('ArrowLeft')

      // Submenu should close
      await expect(subContent).toHaveCount(0)

      // Focus should return to sub trigger
      await expect(subTrigger).toBeFocused()
    })

    test('ESC closes only submenu, not parent menu', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })

      await fileTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]').first()

      // Open submenu
      await subTrigger.hover()
      const subContent = page.locator('[data-slot="menubar-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      // Focus a sub item and press ESC
      const subItem = subContent.locator('[data-slot="menubar-item"]').first()
      await subItem.focus()
      await page.keyboard.press('Escape')

      // Submenu should close
      await expect(subContent).toHaveCount(0)

      // Parent menu should remain open
      await expect(content).toBeVisible()
    })

    test('sub trigger has chevron icon and aria attributes', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })

      await fileTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]').first()

      await expect(subTrigger).toHaveAttribute('aria-haspopup', 'menu')
      await expect(subTrigger).toHaveAttribute('aria-expanded', 'false')
      await expect(subTrigger.locator('svg').last()).toBeVisible()
    })
  })

  test.describe('Disabled Items', () => {
    test('disabled item is not interactive', async ({ page }) => {
      const menubar = page.locator('[bf-s^="MenubarApplicationDemo_"]').first()
      const fileTrigger = menubar.locator('[data-slot="menubar-trigger"]').filter({ hasText: /^File$/ })

      await fileTrigger.click()

      const content = page.locator('[data-slot="menubar-content"][data-state="open"]')
      const disabledItem = content.locator('[data-slot="menubar-item"]').filter({ hasText: 'New Incognito Window' })

      await expect(disabledItem).toHaveAttribute('aria-disabled', 'true')
      await expect(disabledItem).toHaveClass(/pointer-events-none/)
    })
  })

})
