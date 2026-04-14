import { test, expect } from '@playwright/test'

test.describe('Social Feed Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/social-feed')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="SocialFeedDemo_"]:not([data-slot])').first()

  const likeBtn = (s: any, postIndex: number) =>
    s.locator('.flex.items-center.gap-1.border-t').nth(postIndex).locator('button').first()

  const commentToggleBtn = (s: any, postIndex: number) =>
    s.locator('.flex.items-center.gap-1.border-t').nth(postIndex).locator('button').nth(1)

  test.describe('Initial Render', () => {
    test('renders stats bar with post/like/comment counts', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=3 posts')).toBeVisible()
      await expect(s.locator('text=91 likes')).toBeVisible()
      await expect(s.locator('text=3 comments')).toBeVisible()
    })

    test('renders 3 posts', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=Mia Torres').first()).toBeVisible()
      await expect(s.locator('text=Noah Patel')).toBeVisible()
      await expect(s.locator('text=Ethan Brooks')).toBeVisible()
    })

    test('first post shows expanded comments by default', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=James O\'Brien')).toBeVisible()
      await expect(s.locator('text=Sara Lin')).toBeVisible()
    })

    test('second post starts with comments collapsed', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=Lily Chang')).not.toBeVisible()
    })

    test('posts render like counts', async ({ page }) => {
      const s = section(page)
      await expect(likeBtn(s, 0)).toContainText('42')
      await expect(likeBtn(s, 1)).toContainText('18')
      await expect(likeBtn(s, 2)).toContainText('31')
    })
  })

  test.describe('Post Like Toggle', () => {
    test('liking a post increments like count', async ({ page }) => {
      const s = section(page)
      const btn = likeBtn(s, 2)
      await expect(btn).toContainText('31')
      await btn.click()
      await expect(btn).toContainText('32')
    })

    test('unliking a post decrements like count', async ({ page }) => {
      const s = section(page)
      const btn = likeBtn(s, 1)
      await expect(btn).toContainText('18')
      await btn.click()
      await expect(btn).toContainText('17')
    })

    test('total likes in stats bar updates after like', async ({ page }) => {
      const s = section(page)
      await likeBtn(s, 2).click()
      await expect(s.locator('text=92 likes')).toBeVisible()
    })

    test('total likes decrements after unlike', async ({ page }) => {
      const s = section(page)
      await likeBtn(s, 1).click()
      await expect(s.locator('text=90 likes')).toBeVisible()
    })
  })

  test.describe('Comment Toggle', () => {
    test('clicking comment button expands comments for collapsed post', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=Lily Chang')).not.toBeVisible()
      await commentToggleBtn(s, 1).click()
      await expect(s.locator('text=Lily Chang')).toBeVisible()
    })

    test('clicking comment button collapses expanded comments', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=James O\'Brien')).toBeVisible()
      await commentToggleBtn(s, 0).click()
      await expect(s.locator('text=James O\'Brien')).not.toBeVisible()
    })
  })

  test.describe('Add Comment', () => {
    test('adding a comment updates comment count button', async ({ page }) => {
      const s = section(page)
      await commentToggleBtn(s, 2).click()
      const commentInput = s.locator('input[placeholder="Write a comment..."]').last()
      await commentInput.fill('Great session!')
      await commentInput.press('Enter')
      await expect(commentToggleBtn(s, 2)).toContainText('1')
    })

    test('added comment appears in the list', async ({ page }) => {
      const s = section(page)
      const commentInput = s.locator('input[placeholder="Write a comment..."]').first()
      await commentInput.fill('This is helpful!')
      await commentInput.press('Enter')
      await expect(s.locator('text=This is helpful!')).toBeVisible()
    })

    test('added comment shows author as "You"', async ({ page }) => {
      const s = section(page)
      const commentInput = s.locator('input[placeholder="Write a comment..."]').first()
      await commentInput.fill('My new comment')
      await commentInput.press('Enter')
      await expect(s.locator('text=You').first()).toBeVisible()
    })

    test('empty input does not add comment', async ({ page }) => {
      const s = section(page)
      await expect(commentToggleBtn(s, 0)).toContainText('2')
      const commentInput = s.locator('input[placeholder="Write a comment..."]').first()
      await commentInput.fill('   ')
      await commentInput.press('Enter')
      await expect(commentToggleBtn(s, 0)).toContainText('2')
    })

    test('total comments in stats bar updates after adding comment', async ({ page }) => {
      const s = section(page)
      const commentInput = s.locator('input[placeholder="Write a comment..."]').first()
      await commentInput.fill('Stats test')
      await commentInput.press('Enter')
      await expect(s.locator('text=4 comments')).toBeVisible()
    })
  })

  test.describe('Comment Like Toggle', () => {
    test('liking a comment changes its like count', async ({ page }) => {
      const s = section(page)
      const commentLikeBtn = s.locator('.flex.items-center.gap-2.mt-1 button').first()
      const beforeText = await commentLikeBtn.textContent()
      await commentLikeBtn.click()
      const afterText = await commentLikeBtn.textContent()
      expect(afterText).not.toBe(beforeText)
    })

    test('unliking a comment changes its like count', async ({ page }) => {
      const s = section(page)
      const commentLikeBtn = s.locator('.flex.items-center.gap-2.mt-1 button').nth(1)
      const beforeText = await commentLikeBtn.textContent()
      await commentLikeBtn.click()
      const afterText = await commentLikeBtn.textContent()
      expect(afterText).not.toBe(beforeText)
    })
  })

  test.describe('Nested Replies', () => {
    test('first post shows existing reply from Mia Torres', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=I\'ll add a section on that in the follow-up')).toBeVisible()
    })

    test('reply input is shown when a comment has replies', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('input[placeholder="Reply..."]')).toBeVisible()
    })

    test('add reply via input appends to reply list', async ({ page }) => {
      const s = section(page)
      const replyInput = s.locator('input[placeholder="Reply..."]').first()
      await replyInput.fill('Thanks for the suggestion!')
      await replyInput.press('Enter')
      await expect(s.locator('text=Thanks for the suggestion!')).toBeVisible()
      await expect(replyInput).toHaveValue('')
    })
  })
})
