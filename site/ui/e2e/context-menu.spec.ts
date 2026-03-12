import { test, expect } from '@playwright/test'

test.describe('ContextMenu Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/context-menu')
  })

  test.describe('Basic Demo', () => {
    test('opens menu on right-click and shows items', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuBasicDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      // Right-click to open
      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()
      await expect(content.locator('text=Back')).toBeVisible()
      await expect(content.locator('text=Forward')).toBeVisible()
      await expect(content.locator('text=Reload')).toBeVisible()
    })

    test('displays keyboard shortcuts', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuBasicDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const shortcuts = content.locator('[data-slot="context-menu-shortcut"]')
      expect(await shortcuts.count()).toBeGreaterThanOrEqual(1)
    })

    test('closes on item click', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuBasicDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      await content.locator('[data-slot="context-menu-item"]').filter({ hasText: 'Back' }).click()

      await expect(content).toHaveCount(0)
    })

    test('closes on ESC', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuBasicDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(content).toHaveCount(0)
    })

    test('closes on click outside', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuBasicDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()

      // Click outside the menu (on the page header)
      await page.locator('h1').click()
      await expect(content).toHaveCount(0)
    })
  })

  test.describe('Checkbox Demo', () => {
    test('opens menu and shows checkbox items', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuCheckboxDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()

      const checkboxItems = content.locator('[role="menuitemcheckbox"]')
      expect(await checkboxItems.count()).toBe(2)
    })

    test('toggles checkbox on click', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuCheckboxDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const bookmarksItem = content.locator('[role="menuitemcheckbox"]').filter({ hasText: 'Show Bookmarks Bar' })

      // Initially checked
      await expect(bookmarksItem).toHaveAttribute('aria-checked', 'true')

      // Click to uncheck
      await bookmarksItem.click()
      await expect(bookmarksItem).toHaveAttribute('aria-checked', 'false')

      // Menu should still be open
      await expect(content).toBeVisible()
    })

    test('checkbox item does not close menu', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuCheckboxDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const urlsItem = content.locator('[role="menuitemcheckbox"]').filter({ hasText: 'Show Full URLs' })

      // Initially unchecked
      await expect(urlsItem).toHaveAttribute('aria-checked', 'false')

      // Click to check
      await urlsItem.click()
      await expect(urlsItem).toHaveAttribute('aria-checked', 'true')

      // Menu should still be open
      await expect(content).toBeVisible()
    })
  })

  test.describe('Full Demo', () => {
    test('opens menu on right-click', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()
      await expect(content.locator('text=Back')).toBeVisible()
      await expect(content.locator('text=Forward')).toBeVisible()
      await expect(content.locator('text=Reload')).toBeVisible()
    })

    test('keyboard navigation with arrow keys', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      await content.focus()

      // Arrow down should focus first item
      await page.keyboard.press('ArrowDown')
      const firstItem = content.locator('[data-slot="context-menu-item"]').first()
      await expect(firstItem).toBeFocused()

      // Arrow down again should focus second item
      await page.keyboard.press('ArrowDown')
      const secondItem = content.locator('[data-slot="context-menu-item"]').nth(1)
      await expect(secondItem).toBeFocused()

      // Arrow up should go back to first item
      await page.keyboard.press('ArrowUp')
      await expect(firstItem).toBeFocused()
    })

    test('Home/End key navigation', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      await content.focus()

      // End should focus last item
      await page.keyboard.press('End')
      const items = content.locator('[data-slot="context-menu-item"]')
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
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')
      await expect(subTrigger).toBeVisible()

      // Hover over sub trigger
      await subTrigger.hover()

      // Wait for submenu to open (100ms delay + buffer)
      const subContent = page.locator('[data-slot="context-menu-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      // Submenu should contain More Tools items
      await expect(subContent.locator('text=Save Page As...')).toBeVisible()
      await expect(subContent.locator('text=Developer Tools')).toBeVisible()
    })

    test('opens submenu with ArrowRight key', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')

      // Focus the sub trigger
      await subTrigger.focus()
      await page.keyboard.press('ArrowRight')

      const subContent = page.locator('[data-slot="context-menu-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })
    })

    test('closes submenu with ArrowLeft key', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')

      // Open submenu
      await subTrigger.hover()
      const subContent = page.locator('[data-slot="context-menu-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      // Focus a sub item and press ArrowLeft
      const subItem = subContent.locator('[data-slot="context-menu-item"]').first()
      await subItem.focus()
      await page.keyboard.press('ArrowLeft')

      // Submenu should close
      await expect(subContent).toHaveCount(0)

      // Focus should return to sub trigger
      await expect(subTrigger).toBeFocused()
    })

    test('ESC closes only submenu, not parent menu', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')

      // Open submenu
      await subTrigger.hover()
      const subContent = page.locator('[data-slot="context-menu-sub-content"][data-state="open"]')
      await expect(subContent).toBeVisible({ timeout: 2000 })

      // Focus a sub item and press ESC
      const subItem = subContent.locator('[data-slot="context-menu-item"]').first()
      await subItem.focus()
      await page.keyboard.press('Escape')

      // Submenu should close
      await expect(subContent).toHaveCount(0)

      // Parent menu should remain open
      await expect(content).toBeVisible()
    })

    test('sub trigger has chevron icon and aria attributes', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const subTrigger = content.locator('[data-sub-trigger="true"]')

      await expect(subTrigger).toHaveAttribute('aria-haspopup', 'menu')
      await expect(subTrigger).toHaveAttribute('aria-expanded', 'false')

      // Should contain a chevron SVG
      await expect(subTrigger.locator('svg').last()).toBeVisible()
    })
  })

  test.describe('Checkbox Items (Full)', () => {
    test('toggles checkbox item on click', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const checkboxItems = content.locator('[role="menuitemcheckbox"]')
      expect(await checkboxItems.count()).toBe(2)

      // "Show Bookmarks Bar" should be initially checked
      const bookmarksItem = checkboxItems.filter({ hasText: 'Show Bookmarks Bar' })
      await expect(bookmarksItem).toHaveAttribute('aria-checked', 'true')

      // Click to uncheck
      await bookmarksItem.click()
      await expect(bookmarksItem).toHaveAttribute('aria-checked', 'false')

      // Menu should still be open
      await expect(content).toBeVisible()
    })
  })

  test.describe('Radio Items', () => {
    test('selects radio item on click', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const radioItems = content.locator('[role="menuitemradio"]')
      expect(await radioItems.count()).toBe(2)

      // "Pedro Duarte" should be initially selected
      const pedroItem = radioItems.filter({ hasText: 'Pedro Duarte' })
      await expect(pedroItem).toHaveAttribute('aria-checked', 'true')

      // Click "Colm Tuite" to select
      const colmItem = radioItems.filter({ hasText: 'Colm Tuite' })
      await colmItem.click()
      await expect(colmItem).toHaveAttribute('aria-checked', 'true')

      // "Pedro Duarte" should now be deselected
      await expect(pedroItem).toHaveAttribute('aria-checked', 'false')
    })

    test('radio items are mutually exclusive', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const radioItems = content.locator('[role="menuitemradio"]')

      // Click Colm
      const colmItem = radioItems.filter({ hasText: 'Colm Tuite' })
      await colmItem.click()

      // Only Colm should be checked
      const checkedItems = content.locator('[role="menuitemradio"][aria-checked="true"]')
      expect(await checkedItems.count()).toBe(1)
      await expect(colmItem).toHaveAttribute('aria-checked', 'true')
    })

    test('radio item does not close menu', async ({ page }) => {
      const demo = page.locator('[bf-s^="ContextMenuFullDemo_"]').first()
      const trigger = demo.locator('[data-slot="context-menu-trigger"]')

      await trigger.click({ button: 'right' })

      const content = page.locator('[data-slot="context-menu-content"][data-state="open"]')
      const colmItem = content.locator('[role="menuitemradio"]').filter({ hasText: 'Colm Tuite' })
      await colmItem.click()

      // Menu should still be open
      await expect(content).toBeVisible()
    })
  })

})
