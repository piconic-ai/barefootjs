import { test, expect } from '@playwright/test'

test.describe('Comments Block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/comments')
  })

  test('renders initial comments with stats', async ({ page }) => {
    const section = page.locator('[bf-s^="CommentsDemo_"]:not([data-slot])').first()

    // Should render 4 comment items
    const items = section.locator('.comment-item')
    await expect(items).toHaveCount(4)

    // Stats bar should show counts
    await expect(section.locator('text=4 comments')).toBeVisible()
  })

  test('add new comment updates list and stats', async ({ page }) => {
    const section = page.locator('[bf-s^="CommentsDemo_"]:not([data-slot])').first()

    // Type a comment in the textarea
    const textarea = section.locator('textarea[placeholder="Write a comment..."]')
    await textarea.fill('This is a test comment')

    // Click Post Comment
    await section.locator('button:has-text("Post Comment")').click()

    // Should have 5 comments now
    const items = section.locator('.comment-item')
    await expect(items).toHaveCount(5)
    await expect(section.locator('text=5 comments')).toBeVisible()

    // New comment should be visible
    await expect(section.locator('text=This is a test comment')).toBeVisible()
  })

  test('delete comment removes from list', async ({ page }) => {
    const section = page.locator('[bf-s^="CommentsDemo_"]:not([data-slot])').first()

    // Delete first comment
    const deleteBtn = section.locator('.comment-item').first().locator('button:has-text("Delete")').first()
    await deleteBtn.click()

    // Should have 3 comments
    const items = section.locator('.comment-item')
    await expect(items).toHaveCount(3)
    await expect(section.locator('text=3 comments')).toBeVisible()
  })

  test('sort buttons reorder comments', async ({ page }) => {
    const section = page.locator('[bf-s^="CommentsDemo_"]:not([data-slot])').first()

    // Default is newest — first comment should be Alice's (most recent)
    const firstText = section.locator('.comment-item').first().locator('.comment-text')
    await expect(firstText).toContainText('signal-based reactivity')

    // Switch to oldest
    await section.locator('button:has-text("Oldest")').click()

    // Oldest comment is Frank's (3d ago)
    const oldestText = section.locator('.comment-item').first().locator('.comment-text')
    await expect(oldestText).toContainText('Quick question')

    // Switch to popular
    await section.locator('button:has-text("Popular")').click()

    // Most popular is Eve's (29 total reactions)
    const popularText = section.locator('.comment-item').first().locator('.comment-text')
    await expect(popularText).toContainText('composite loop pattern')
  })

  // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
  test.skip('inline edit mode toggles and saves', async ({ page }) => {
    const section = page.locator('[bf-s^="CommentsDemo_"]:not([data-slot])').first()
    const firstComment = section.locator('.comment-item').first()

    // Click Edit
    await firstComment.locator('button:has-text("Edit")').click()

    // Should show textarea with current text and Save/Cancel buttons
    await expect(firstComment.locator('button:has-text("Save")')).toBeVisible()
    await expect(firstComment.locator('button:has-text("Cancel")')).toBeVisible()

    // Edit should no longer be visible
    await expect(firstComment.locator('button:has-text("Edit")')).not.toBeVisible()

    // Cancel should restore view mode
    await firstComment.locator('button:has-text("Cancel")').click()
    await expect(firstComment.locator('button:has-text("Edit")')).toBeVisible()
  })

  // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
  test.skip('toggle reaction updates count', async ({ page }) => {
    const section = page.locator('[bf-s^="CommentsDemo_"]:not([data-slot])').first()
    const firstComment = section.locator('.comment-item').first()

    const thumbsUp = firstComment.locator('button:has-text("👍12")')
    await expect(thumbsUp).toBeVisible()

    // Click to react
    await thumbsUp.click()
    await expect(firstComment.locator('button:has-text("👍13")')).toBeVisible()

    // Click again to unreact
    await firstComment.locator('button:has-text("👍13")').click()
    await expect(firstComment.locator('button:has-text("👍12")')).toBeVisible()
  })

  // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
  test.skip('expand replies shows nested content', async ({ page }) => {
    const section = page.locator('[bf-s^="CommentsDemo_"]:not([data-slot])').first()

    // Switch to oldest for consistent order
    await section.locator('button:has-text("Oldest")').click()

    // Frank's comment (first in oldest) has 3 replies hidden
    const frankComment = section.locator('.comment-item').first()
    await frankComment.locator('button:has-text("Show replies")').click()

    // Should show replies
    const replies = frankComment.locator('.reply-item')
    await expect(replies).toHaveCount(3)
  })

  // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
  test.skip('add reply via input inside nested loop', async ({ page }) => {
    const section = page.locator('[bf-s^="CommentsDemo_"]:not([data-slot])').first()

    await section.locator('button:has-text("Oldest")').click()
    const frankComment = section.locator('.comment-item').first()
    await frankComment.locator('button:has-text("Show replies")').click()

    const replyInput = frankComment.locator('input[placeholder="Write a reply..."]')
    await replyInput.fill('Great explanation!')
    await replyInput.press('Enter')

    await expect(frankComment.locator('.reply-item')).toHaveCount(4)
    await expect(frankComment.locator('text=Great explanation!')).toBeVisible()
  })

  // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
  test.skip('delete reply removes from nested list', async ({ page }) => {
    const section = page.locator('[bf-s^="CommentsDemo_"]:not([data-slot])').first()

    const aliceComment = section.locator('.comment-item').first()
    const replies = aliceComment.locator('.reply-item')
    await expect(replies).toHaveCount(2)

    await replies.first().locator('button:has-text("Delete")').click()
    await expect(aliceComment.locator('.reply-item')).toHaveCount(1)
  })

  test('delete all comments shows empty state', async ({ page }) => {
    const section = page.locator('[bf-s^="CommentsDemo_"]:not([data-slot])').first()

    // Delete all 4 comments
    for (let i = 0; i < 4; i++) {
      const deleteBtn = section.locator('.comment-item').first().locator('button:has-text("Delete")').first()
      await deleteBtn.click()
    }

    // Should show empty state
    await expect(section.locator('text=No comments yet')).toBeVisible()
    await expect(section.locator('text=0 comments')).toBeVisible()
  })
})
