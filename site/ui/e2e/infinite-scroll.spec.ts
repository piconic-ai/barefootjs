import { test, expect } from '@playwright/test'

test.describe('Async Infinite Scroll Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    // Stub Math.random before any page script runs so the demo's 12%
    // random error injection in fetchPage never fires for pagination
    // flows. Individual tests that need to exercise the error path
    // override Math.random locally (see the "Error state" suite).
    await page.addInitScript(() => {
      Math.random = () => 0.5
    })
    await page.goto('/components/infinite-scroll')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="InfiniteScrollDemo_"]:not([data-slot])').first()

  // --- Initial Render ---

  test.describe('Initial Render', () => {
    test('renders stats bar with initial counts', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('[data-slot="stats-bar"]')).toBeVisible()
      await expect(s.locator('.scroll-total-count')).toContainText('8')
      await expect(s.locator('.scroll-liked-count')).toContainText('0')
      await expect(s.locator('.scroll-saved-count')).toContainText('0')
    })

    test('renders initial 8 articles', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('[data-slot="article-list"]')).toBeVisible()
      await expect(s.locator('.scroll-article')).toHaveCount(8)
    })

    test('renders like and save buttons for each article', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('[data-slot="like-btn"]')).toHaveCount(8)
      await expect(s.locator('[data-slot="save-btn"]')).toHaveCount(8)
    })

    test('all like buttons start in unpressed state', async ({ page }) => {
      const s = section(page)
      const likeBtns = s.locator('[data-slot="like-btn"]')
      for (let i = 0; i < 8; i++) {
        await expect(likeBtns.nth(i)).toHaveAttribute('aria-pressed', 'false')
        await expect(likeBtns.nth(i)).toHaveAttribute('data-liked', 'false')
      }
    })

    test('all save buttons start in unpressed state', async ({ page }) => {
      const s = section(page)
      const saveBtns = s.locator('[data-slot="save-btn"]')
      for (let i = 0; i < 8; i++) {
        await expect(saveBtns.nth(i)).toHaveAttribute('aria-pressed', 'false')
        await expect(saveBtns.nth(i)).toHaveAttribute('data-saved', 'false')
      }
    })

    test('renders sentinel div for IntersectionObserver', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.is-sentinel')).toBeVisible()
    })
  })

  // --- Per-Item Actions ---

  test.describe('Like action', () => {
    test('clicking like button toggles liked state', async ({ page }) => {
      const s = section(page)
      const likeBtn = s.locator('[data-slot="like-btn"]').first()

      await expect(likeBtn).toHaveAttribute('aria-pressed', 'false')
      await likeBtn.click()
      await expect(likeBtn).toHaveAttribute('aria-pressed', 'true')
      await expect(likeBtn).toHaveAttribute('data-liked', 'true')
    })

    test('liking an article increments the liked count', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.scroll-liked-count')).toContainText('0')

      await s.locator('[data-slot="like-btn"]').first().click()
      await expect(s.locator('.scroll-liked-count')).toContainText('1')
    })

    test('unliking an article decrements the liked count', async ({ page }) => {
      const s = section(page)
      const likeBtn = s.locator('[data-slot="like-btn"]').first()

      await likeBtn.click()
      await expect(s.locator('.scroll-liked-count')).toContainText('1')

      await likeBtn.click()
      await expect(s.locator('.scroll-liked-count')).toContainText('0')
    })

    test('liking multiple articles updates count correctly', async ({ page }) => {
      const s = section(page)
      const likeBtns = s.locator('[data-slot="like-btn"]')

      await likeBtns.nth(0).click()
      await likeBtns.nth(2).click()
      await likeBtns.nth(4).click()
      await expect(s.locator('.scroll-liked-count')).toContainText('3')
    })
  })

  test.describe('Save action', () => {
    test('clicking save button toggles saved state', async ({ page }) => {
      const s = section(page)
      const saveBtn = s.locator('[data-slot="save-btn"]').first()

      await expect(saveBtn).toHaveAttribute('aria-pressed', 'false')
      await saveBtn.click()
      await expect(saveBtn).toHaveAttribute('aria-pressed', 'true')
      await expect(saveBtn).toHaveAttribute('data-saved', 'true')
    })

    test('saving an article increments the saved count', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.scroll-saved-count')).toContainText('0')

      await s.locator('[data-slot="save-btn"]').first().click()
      await expect(s.locator('.scroll-saved-count')).toContainText('1')
    })

    test('unsaving an article decrements the saved count', async ({ page }) => {
      const s = section(page)
      const saveBtn = s.locator('[data-slot="save-btn"]').first()

      await saveBtn.click()
      await expect(s.locator('.scroll-saved-count')).toContainText('1')

      await saveBtn.click()
      await expect(s.locator('.scroll-saved-count')).toContainText('0')
    })
  })

  test.describe('Like and Save independence', () => {
    test('liking an article does not affect the save count', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-slot="like-btn"]').first().click()
      await expect(s.locator('.scroll-saved-count')).toContainText('0')
    })

    test('saving an article does not affect the like count', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-slot="save-btn"]').first().click()
      await expect(s.locator('.scroll-liked-count')).toContainText('0')
    })
  })

  // --- Infinite Scroll (load more) ---

  test.describe('Load more via scroll', () => {
    test('scrolling to bottom loads additional articles', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.scroll-article')).toHaveCount(8)

      // Scroll the sentinel into view to trigger IntersectionObserver
      await s.locator('.is-sentinel').scrollIntoViewIfNeeded()

      // Wait for next page to load (simulated 700ms delay + some buffer)
      await expect(s.locator('.scroll-article')).toHaveCount(16, { timeout: 5000 })
      await expect(s.locator('.scroll-total-count')).toContainText('16')
    })

    test('loaded articles are appended after existing articles', async ({ page }) => {
      const s = section(page)

      // Record first article id before load
      const firstBefore = await s.locator('.scroll-article').first().getAttribute('data-article-id')

      await s.locator('.is-sentinel').scrollIntoViewIfNeeded()
      await expect(s.locator('.scroll-article')).toHaveCount(16, { timeout: 5000 })

      // First article should be the same (items were appended, not prepended)
      const firstAfter = await s.locator('.scroll-article').first().getAttribute('data-article-id')
      expect(firstAfter).toBe(firstBefore)
    })

    test('likes persist on existing articles after loading more', async ({ page }) => {
      const s = section(page)

      // Like the first article
      await s.locator('[data-slot="like-btn"]').first().click()
      await expect(s.locator('.scroll-liked-count')).toContainText('1')

      // Trigger load more
      await s.locator('.is-sentinel').scrollIntoViewIfNeeded()
      await expect(s.locator('.scroll-article')).toHaveCount(16, { timeout: 5000 })

      // Liked count should still be 1 (immutable update, not reset)
      await expect(s.locator('.scroll-liked-count')).toContainText('1')

      // First article should still be liked
      await expect(s.locator('[data-slot="like-btn"]').first()).toHaveAttribute('aria-pressed', 'true')
    })

    test('page indicator advances after loading more', async ({ page }) => {
      const s = section(page)

      await s.locator('.is-sentinel').scrollIntoViewIfNeeded()
      await expect(s.locator('.scroll-article')).toHaveCount(16, { timeout: 5000 })

      // Page should have advanced from 1 to 2
      await expect(s.locator('[data-slot="stats-bar"]')).toContainText('Page 2')
    })
  })

  // --- End of List ---

  test.describe('End state', () => {
    test('end-of-list message appears after all 40 articles are loaded', async ({ page }) => {
      const s = section(page)

      // Load all 5 pages (8 articles each = 40 total)
      for (let i = 0; i < 4; i++) {
        await s.locator('.is-sentinel').scrollIntoViewIfNeeded()
        const expectedCount = (i + 2) * 8
        await expect(s.locator('.scroll-article')).toHaveCount(expectedCount, { timeout: 5000 })
      }

      // Now all 40 articles are loaded — end state should appear
      await expect(s.locator('[data-slot="end-state"]')).toBeVisible({ timeout: 3000 })
      await expect(s.locator('[data-slot="end-state"]')).toContainText('40 articles')
    })
  })

  // --- Retry after error ---

  test.describe('Error state', () => {
    test('retry button reloads after error', async ({ page }) => {
      const s = section(page)

      // Force an error by overriding Math.random to always return below the threshold
      await page.evaluate(() => {
        (window as any).__originalMathRandom = Math.random
        Math.random = () => 0.01 // always triggers the 12% error condition
      })

      await s.locator('.is-sentinel').scrollIntoViewIfNeeded()

      // Wait for error state (random still set to 0.01)
      await expect(s.locator('[data-slot="error-state"]')).toBeVisible({ timeout: 3000 })

      // Restore Math.random so the retry succeeds
      await page.evaluate(() => {
        Math.random = (window as any).__originalMathRandom
      })

      // Click retry — should load page 2
      await s.locator('.scroll-retry-btn').click()
      await expect(s.locator('.scroll-article')).toHaveCount(16, { timeout: 5000 })
      await expect(s.locator('[data-slot="error-state"]')).not.toBeVisible()
    })
  })
})
