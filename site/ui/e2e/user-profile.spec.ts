import { test, expect } from '@playwright/test'

test.describe('User Profile Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/user-profile')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="UserProfileDemo_"]:not([data-slot])').first()

  test.describe('Profile Header', () => {
    test('renders name, bio, and meta info', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.profile-name')).toContainText('Alex Chen')
      await expect(s.locator('.profile-bio')).toBeVisible()
      await expect(s.locator('.profile-meta')).toContainText('@alexdev')
    })

    test('shows verified badge', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.verified-badge')).toBeVisible()
    })
  })

  test.describe('Inline Editing - Name', () => {
    test('clicking edit shows input with save/cancel', async ({ page }) => {
      const s = section(page)
      // Click the Edit button next to name
      await s.locator('.profile-name').locator('..').locator('button:has-text("Edit")').click()
      await expect(s.locator('.profile-name-input')).toBeVisible()
      await expect(s.locator('button:has-text("Save")').first()).toBeVisible()
      await expect(s.locator('button:has-text("Cancel")').first()).toBeVisible()
    })

    test('cancel restores original view', async ({ page }) => {
      const s = section(page)
      await s.locator('.profile-name').locator('..').locator('button:has-text("Edit")').click()
      await s.locator('button:has-text("Cancel")').first().click()
      await expect(s.locator('.profile-name')).toContainText('Alex Chen')
      await expect(s.locator('.verified-badge')).toBeVisible()
    })

    test('editing name hides verified badge', async ({ page }) => {
      const s = section(page)
      await s.locator('.profile-name').locator('..').locator('button:has-text("Edit")').click()
      await expect(s.locator('.verified-badge')).not.toBeVisible()
    })
  })

  test.describe('Inline Editing - Bio', () => {
    test('clicking edit bio shows textarea', async ({ page }) => {
      const s = section(page)
      await s.locator('.profile-bio').locator('..').locator('button:has-text("Edit")').click()
      await expect(s.locator('.profile-bio-input')).toBeVisible()
    })

    test('cancel bio edit restores original', async ({ page }) => {
      const s = section(page)
      const originalBio = await s.locator('.profile-bio').textContent()
      await s.locator('.profile-bio').locator('..').locator('button:has-text("Edit")').click()
      await s.locator('button:has-text("Cancel")').first().click()
      await expect(s.locator('.profile-bio')).toContainText(originalBio!)
    })
  })

  test.describe('Stats Bar', () => {
    test('renders repo count and stars', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.stat-repos')).toContainText('8')
      await expect(s.locator('.stat-stars')).toBeVisible()
    })
  })

  test.describe('Tabs', () => {
    test('overview tab is selected by default', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.pinned-repo').first()).toBeVisible()
    })

    test('clicking Repositories shows repo list', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-slot="tabs-trigger"]:has-text("Repositories")').click()
      await expect(s.locator('.repo-search')).toBeVisible()
      await expect(s.locator('.repo-item').first()).toBeVisible()
    })

    test('clicking Activity shows activity feed', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-slot="tabs-trigger"]:has-text("Activity")').click()
      await expect(s.locator('.activity-item').first()).toBeVisible()
    })
  })

  test.describe('Overview Tab', () => {
    test('renders pinned repos', async ({ page }) => {
      const s = section(page)
      const pinned = s.locator('.pinned-repo')
      await expect(pinned).toHaveCount(4)
    })

    test('renders skills with badges', async ({ page }) => {
      const s = section(page)
      const skills = s.locator('.skill-tag')
      await expect(skills).toHaveCount(6)
    })

    test('renders about section', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.profile-about')).toBeVisible()
    })
  })

  test.describe('Repositories Tab', () => {
    test.beforeEach(async ({ page }) => {
      const s = section(page)
      await s.locator('[data-slot="tabs-trigger"]:has-text("Repositories")').click()
    })

    test('search filters repos', async ({ page }) => {
      const s = section(page)
      await s.locator('.repo-search').fill('compiler')
      await expect(s.locator('.repo-count')).toContainText('1 ')
    })

    test('search preserves focus', async ({ page }) => {
      const s = section(page)
      const search = s.locator('.repo-search')
      await search.focus()
      await search.type('go', { delay: 30 })
      const isFocused = await search.evaluate((el: HTMLElement) => document.activeElement === el)
      expect(isFocused).toBe(true)
    })

    test('results count updates', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.repo-count')).toContainText('8 repositories')
      await s.locator('.repo-search').fill('rust')
      await expect(s.locator('.repo-count')).not.toContainText('8 ')
    })

    test('empty state shows when no match', async ({ page }) => {
      const s = section(page)
      await s.locator('.repo-search').fill('nonexistent')
      await expect(s.locator('.repo-empty')).toBeVisible()
    })

    test('star toggle changes button text', async ({ page }) => {
      const s = section(page)
      const firstStarBtn = s.locator('.star-button').first()
      const initialText = await firstStarBtn.textContent()
      await firstStarBtn.click()
      const newText = await firstStarBtn.textContent()
      expect(initialText).not.toBe(newText)
    })
  })

  test.describe('Activity Tab', () => {
    test.beforeEach(async ({ page }) => {
      const s = section(page)
      await s.locator('[data-slot="tabs-trigger"]:has-text("Activity")').click()
    })

    test('renders activity items', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.activity-item')).toHaveCount(8)
    })

    test('shows type badges', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.activity-badge').first()).toBeVisible()
    })

    test('shows relative timestamps', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.activity-time').first()).toBeVisible()
    })
  })
})
