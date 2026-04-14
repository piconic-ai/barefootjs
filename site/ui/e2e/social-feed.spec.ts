import { test, expect } from '@playwright/test'

test.describe('Social Feed Block (#830)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/social-feed')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="SocialFeedDemo_"]:not([data-slot])').first()

  // Each post action bar: "flex items-center gap-1 border-t px-4 py-2"
  // Buttons inside are plain <button> (rendered text has no space between emoji and number)
  const likeBtn = (s: any, postIndex: number) =>
    s.locator('.flex.items-center.gap-1.border-t').nth(postIndex).locator('button').first()

  const commentToggleBtn = (s: any, postIndex: number) =>
    s.locator('.flex.items-center.gap-1.border-t').nth(postIndex).locator('button').nth(1)

  test('renders initial posts with stats', async ({ page }) => {
    const s = section(page)

    // Stats bar should show counts
    await expect(s.locator('text=3 posts')).toBeVisible()
    await expect(s.locator('text=91 likes')).toBeVisible()
    await expect(s.locator('text=3 comments')).toBeVisible()

    // First post author should be visible (appears twice — post + reply author)
    await expect(s.locator('text=Mia Torres').first()).toBeVisible()
  })

  test('toggle comments section shows/hides comments', async ({ page }) => {
    const s = section(page)

    // Mia's post has showComments: true — comments should be visible
    await expect(s.locator('text=James O\'Brien').first()).toBeVisible()

    // Noah's post (index 1) has showComments: false — click to show comments
    await commentToggleBtn(s, 1).click()

    // Lily's comment should now be visible
    await expect(s.locator('text=Lily Chang')).toBeVisible()

    // Click again to hide
    await commentToggleBtn(s, 1).click()
    await expect(s.locator('text=Lily Chang')).not.toBeVisible()
  })

  test('existing replies are visible in expanded comments', async ({ page }) => {
    const s = section(page)

    // Mia's post is expanded and James's comment has 1 reply from Mia
    await expect(s.locator('text=I\'ll add a section on that in the follow-up')).toBeVisible()
  })

  // Skipped: compiler wrapping bug — addReply(post.id, ...) emitted instead of
  // addReply(post().id, ...) in insert() bindEvents at depth 3. Tracked separately.
  test.skip('add reply via input appends to reply list', async ({ page }) => {
    const s = section(page)

    const replyInput = s.locator('input[placeholder="Reply..."]').first()
    await replyInput.fill('Thanks for the suggestion!')
    await replyInput.press('Enter')

    await expect(s.locator('text=Thanks for the suggestion!')).toBeVisible()
    await expect(replyInput).toHaveValue('')
  })

  test('like button on post toggles like state', async ({ page }) => {
    const s = section(page)

    // Mia's post (index 0), not liked, likes = 42
    const btn = likeBtn(s, 0)
    await expect(btn).toContainText('42')
    await btn.click()
    await expect(btn).toContainText('43')
  })

  test('total likes in stats bar updates after like', async ({ page }) => {
    const s = section(page)
    await likeBtn(s, 2).click()
    await expect(s.locator('text=92 likes')).toBeVisible()
  })

  test('add comment via input appends to comment list', async ({ page }) => {
    const s = section(page)

    // Find the comment input in Mia's post (first expanded post)
    const commentInput = s.locator('input[placeholder="Write a comment..."]').first()
    await commentInput.fill('Great discussion!')
    await commentInput.press('Enter')

    // New comment should appear
    await expect(s.locator('text=Great discussion!')).toBeVisible()

    // Input should be cleared
    await expect(commentInput).toHaveValue('')
  })

  test('comment like toggle changes count', async ({ page }) => {
    const s = section(page)
    // James's comment like button
    const commentLikeBtn = s.locator('.flex.items-center.gap-2.mt-1 button').first()
    const beforeText = await commentLikeBtn.textContent()
    await commentLikeBtn.click()
    const afterText = await commentLikeBtn.textContent()
    expect(afterText).not.toBe(beforeText)
  })

  test('reply input is shown when a comment has replies', async ({ page }) => {
    const s = section(page)
    await expect(s.locator('input[placeholder="Reply..."]')).toBeVisible()
  })
})
