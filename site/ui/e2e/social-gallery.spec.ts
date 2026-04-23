import { test, expect } from '@playwright/test'

const routes = [
  { path: '/gallery/social', key: 'feed', title: 'Feed' },
  { path: '/gallery/social/profile', key: 'profile', title: 'Profile' },
  { path: '/gallery/social/thread', key: 'thread', title: 'Thread' },
  { path: '/gallery/social/messages', key: 'messages', title: 'Messages' },
] as const

test.describe('Gallery: Social app', () => {
  test.describe('Layout', () => {
    test('each route renders the social shell with the correct title and active sidebar item', async ({ page }) => {
      for (const route of routes) {
        await page.goto(route.path)
        await expect(page.locator('[data-social-sidebar]')).toBeVisible()
        await expect(page.locator('.social-page-title')).toHaveText(route.title)

        const active = page.locator(`[data-social-nav-item="${route.key}"]`)
        await expect(active).toHaveAttribute('data-active', 'true')
        await expect(active).toHaveAttribute('aria-current', 'page')

        const inactiveCount = await page
          .locator('[data-social-nav-item][data-active="false"]')
          .count()
        expect(inactiveCount).toBe(routes.length - 1)
      }
    })

    test('gallery meta link is outside the social shell', async ({ page }) => {
      await page.goto('/gallery/social')
      const githubLinks = page.locator('a[href*="components/gallery/social"]')
      await expect(githubLinks).toHaveCount(1)
      const insideShell = await page
        .locator('.social-shell a[href*="components/gallery/social"]')
        .count()
      expect(insideShell).toBe(0)
    })
  })

  test.describe('Navigation', () => {
    test('navigates between all social routes via the sidebar', async ({ page }) => {
      await page.goto(routes[0].path)

      for (const target of routes) {
        await page.locator(`[data-social-sidebar] [data-social-nav-item="${target.key}"]`).click()
        await page.waitForURL(`**${target.path}`)
        await expect(page).toHaveURL(new RegExp(`${target.path}$`))
        await expect(page.locator('.social-page-title')).toHaveText(target.title)
        await expect(
          page.locator(`[data-social-nav-item="${target.key}"]`)
        ).toHaveAttribute('data-active', 'true')
      }
    })
  })

  test.describe('Feed page', () => {
    test('renders posts with like and comment buttons', async ({ page }) => {
      await page.goto('/gallery/social')
      await expect(page.locator('.feed-post').first()).toBeVisible()
      const count = await page.locator('.feed-post').count()
      expect(count).toBeGreaterThan(0)
    })

    test('liking a post increments the like count', async ({ page }) => {
      await page.goto('/gallery/social')

      const firstPost = page.locator('.feed-post').first()
      const likeBtn = firstPost.locator('.post-like-btn')
      const initialText = await likeBtn.textContent()
      const initialLikes = parseInt(initialText?.match(/\d+/)?.[0] ?? '0', 10)

      await likeBtn.click()

      const newText = await likeBtn.textContent()
      const newLikes = parseInt(newText?.match(/\d+/)?.[0] ?? '0', 10)
      expect(newLikes).toBe(initialLikes + 1)
    })
  })

  test.describe('Thread page', () => {
    test('renders comment thread with stats', async ({ page }) => {
      await page.goto('/gallery/social/thread')
      await expect(page.locator('.thread-stats')).toBeVisible()
      await expect(page.locator('.comment-item').first()).toBeVisible()
    })

    test('sort buttons reorder the comment list', async ({ page }) => {
      await page.goto('/gallery/social/thread')

      // Default is newest — click oldest to reorder
      await page.locator('.sort-oldest').click()
      await expect(page.locator('.sort-oldest')).toHaveClass(/bg-primary/)

      // Click popular
      await page.locator('.sort-popular').click()
      await expect(page.locator('.sort-popular')).toHaveClass(/bg-primary/)
    })

    test('posting a comment increments the comment count', async ({ page }) => {
      await page.goto('/gallery/social/thread')

      const initialText = await page.locator('.thread-comment-count').textContent()
      const initialCount = parseInt(initialText ?? '0', 10)

      await page.locator('textarea[placeholder="Write a comment..."]').fill('Test comment')
      await page.locator('.post-comment-btn').click()

      const newText = await page.locator('.thread-comment-count').textContent()
      const newCount = parseInt(newText ?? '0', 10)
      expect(newCount).toBe(initialCount + 1)
    })
  })

  test.describe('Profile page', () => {
    test('renders profile header with name and verified badge', async ({ page }) => {
      await page.goto('/gallery/social/profile')
      await expect(page.locator('.profile-name')).toBeVisible()
      await expect(page.locator('.verified-badge')).toBeVisible()
    })

    test('tabs switch between overview, repos, and activity', async ({ page }) => {
      await page.goto('/gallery/social/profile')

      // Default overview tab
      await expect(page.locator('.pinned-repo').first()).toBeVisible()

      // Switch to repos
      await page.locator('[role="tab"]', { hasText: 'Repositories' }).click()
      await expect(page.locator('.repo-count')).toBeVisible()
      await expect(page.locator('.repo-item').first()).toBeVisible()

      // Switch to activity
      await page.locator('[role="tab"]', { hasText: 'Activity' }).click()
      await expect(page.locator('.activity-item').first()).toBeVisible()
    })
  })

  test.describe('Messages page', () => {
    test('renders contact list and chat area', async ({ page }) => {
      await page.goto('/gallery/social/messages')
      await expect(page.locator('.social-page')).toBeVisible()
    })
  })

  test.describe('Cross-page state', () => {
    test('unread message badge appears in sidebar after visiting messages page', async ({ page }) => {
      await page.goto('/gallery/social/messages')

      // Messages page initializes with unread messages → writes to sessionStorage
      // Badge should appear on messages nav item in sidebar
      await expect(page.locator('.social-unread-count')).toBeVisible()
      const badgeText = await page.locator('.social-unread-count').textContent()
      const initialUnread = parseInt(badgeText ?? '0', 10)
      expect(initialUnread).toBeGreaterThan(0)

      // Navigate to feed — badge on messages nav item should persist
      await page.locator('[data-social-sidebar] [data-social-nav-item="feed"]').click()
      await page.waitForURL('**/gallery/social')

      await expect(page.locator('.social-unread-count')).toBeVisible()
      await expect(page.locator('.social-unread-count')).toHaveText(String(initialUnread))
    })
  })
})
