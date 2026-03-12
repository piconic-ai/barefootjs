import { test, expect } from '@playwright/test'

test.describe('Navigation Menu Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/navigation-menu')
  })

  test.describe('Basic Demo', () => {
    test('opens content on trigger click', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const gsTrigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Getting Started' })

      await gsTrigger.click()

      const content = page.locator('[data-slot="navigation-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()
      await expect(content.locator('text=Introduction')).toBeVisible()
      await expect(content.locator('text=Installation')).toBeVisible()
    })

    test('has ARIA attributes on trigger', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const trigger = nav.locator('[data-slot="navigation-menu-trigger"]').first()

      await expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    test('closes content on ESC', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const trigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Getting Started' })

      await trigger.click()

      const content = page.locator('[data-slot="navigation-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(content).toHaveCount(0)
    })

    test('closes content on click outside', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const trigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Getting Started' })

      await trigger.click()

      const content = page.locator('[data-slot="navigation-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()

      await page.locator('h1').click()
      await expect(content).toHaveCount(0)
    })

    test('contains chevron SVG in trigger', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const trigger = nav.locator('[data-slot="navigation-menu-trigger"]').first()

      const chevron = trigger.locator('[data-slot="navigation-menu-chevron"]')
      await expect(chevron).toBeVisible()
    })

    test('renders NavigationMenuLink as <a> with href', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const trigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Getting Started' })

      await trigger.click()

      const content = page.locator('[data-slot="navigation-menu-content"][data-state="open"]')
      const links = content.locator('[data-slot="navigation-menu-link"]')
      expect(await links.count()).toBeGreaterThan(0)

      const firstLink = links.first()
      await expect(firstLink).toHaveAttribute('href')
    })
  })

  test.describe('Hover Behavior', () => {
    test('opens content on hover with delay', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const trigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Getting Started' })

      await trigger.hover()

      // Content should appear after delay
      const content = page.locator('[data-slot="navigation-menu-content"][data-state="open"]')
      await expect(content).toBeVisible({ timeout: 2000 })
    })

    test('content stays open when mouse moves to it', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const trigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Getting Started' })

      // Open via click for reliability
      await trigger.click()

      const content = page.locator('[data-slot="navigation-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()

      // Move mouse to content
      await content.hover()

      // Content should remain visible
      await expect(content).toBeVisible()
    })

    test('roving hover: hovering another trigger switches content', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const gsTrigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Getting Started' })
      const compTrigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Components' })

      // Open Getting Started
      await gsTrigger.click()
      const gsContent = page.locator('[data-slot="navigation-menu-content"][data-state="open"]')
      await expect(gsContent).toBeVisible()
      await expect(gsContent.locator('text=Introduction')).toBeVisible()

      // Hover Components trigger — should switch
      await compTrigger.hover()
      await expect(page.locator('[data-slot="navigation-menu-content"][data-state="open"]').locator('text=Button')).toBeVisible({ timeout: 2000 })
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('ArrowRight on trigger navigates to next trigger', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const gsTrigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Getting Started' })
      const compTrigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Components' })

      await gsTrigger.focus()
      await page.keyboard.press('ArrowRight')
      await expect(compTrigger).toBeFocused()
    })

    test('ArrowLeft on trigger navigates to previous trigger', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const gsTrigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Getting Started' })
      const compTrigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Components' })

      await compTrigger.focus()
      await page.keyboard.press('ArrowLeft')
      await expect(gsTrigger).toBeFocused()
    })

    test('ArrowRight with open menu switches to next menu', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuBasicDemo_"]').first()
      const gsTrigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Getting Started' })

      // Open Getting Started
      await gsTrigger.click()
      const content = page.locator('[data-slot="navigation-menu-content"][data-state="open"]')
      await expect(content).toBeVisible()

      // ArrowRight should switch to Components
      await page.keyboard.press('ArrowRight')
      const compContent = page.locator('[data-slot="navigation-menu-content"][data-state="open"]')
      await expect(compContent.locator('text=Button')).toBeVisible()
    })
  })

  test.describe('With Links Demo', () => {
    test('renders direct links without trigger', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuWithLinksDemo_"]').first()
      const blogLink = nav.locator('[data-slot="navigation-menu-link"]').filter({ hasText: 'Blog' })

      await expect(blogLink).toBeVisible()
      await expect(blogLink).toHaveAttribute('href', '/blog')
    })

    test('active link has aria-current=page', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuWithLinksDemo_"]').first()
      const docsTrigger = nav.locator('[data-slot="navigation-menu-trigger"]').filter({ hasText: 'Documentation' })

      await docsTrigger.click()

      const content = page.locator('[data-slot="navigation-menu-content"][data-state="open"]')
      const activeLink = content.locator('[data-slot="navigation-menu-link"][data-active]')
      await expect(activeLink).toHaveAttribute('aria-current', 'page')
    })

    test('mixes trigger items and direct link items', async ({ page }) => {
      const nav = page.locator('[bf-s^="NavigationMenuWithLinksDemo_"]').first()

      // Should have trigger
      const trigger = nav.locator('[data-slot="navigation-menu-trigger"]')
      expect(await trigger.count()).toBe(1)

      // Should have direct links (Blog + About)
      const directLinks = nav.locator('[data-slot="navigation-menu-item"] > [data-slot="navigation-menu-link"]')
      expect(await directLinks.count()).toBe(2)
    })
  })
})
