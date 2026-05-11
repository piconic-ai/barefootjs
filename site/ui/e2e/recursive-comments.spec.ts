import { test, expect } from '@playwright/test'

test.describe('Recursive Comments Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/recursive-comments')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="RecursiveCommentsDemo_"]:not([data-slot])').first()

  // --- Initial Render ---

  test.describe('Initial Render', () => {
    test('renders 8 comments across 5 depth levels from SSR', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.comment-node')).toHaveCount(8)
      // depth 0..4 each have at least one node
      for (let d = 0; d <= 4; d++) {
        await expect(s.locator(`[data-depth="${d}"]`)).not.toHaveCount(0)
      }
    })

    test('stat strip reflects initial tree', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.recursive-comments-total')).toHaveText('8')
      await expect(s.locator('.recursive-comments-max-depth')).toHaveText('5')
      await expect(s.locator('.recursive-comments-reactions')).toHaveText('20')
    })

    test('every comment id appears exactly once after hydration', async ({ page }) => {
      const ids = ['1', '2', '11', '12', '21', '111', '1111', '11111']
      for (const id of ids) {
        await expect(page.locator(`[data-comment-id="${id}"]`)).toHaveCount(1)
      }
    })

    test('SSR emits bf-parent / bf-mount markers on every recursive depth', async ({ page }) => {
      const s = section(page)
      // depth 0 mounted at slot s12 of RecursiveCommentsDemo
      const d0 = s.locator('[data-comment-id="1"]')
      await expect(d0).toHaveAttribute('bf-mount', 's12')
      // depth 4 mounted at slot s35 of its depth-3 parent CommentNode
      const d4 = s.locator('[data-comment-id="11111"]')
      await expect(d4).toHaveAttribute('bf-mount', 's35')
    })
  })

  // --- Self-Referential Recursion (compiler stress) ---

  test.describe('Self-Referential Recursion', () => {
    test('toggling a reaction at depth 4 does not duplicate any node', async ({ page }) => {
      const s = section(page)
      const deep = s.locator('[data-comment-id="11111"]')
      await deep.locator('.comment-add-reaction').first().click()
      // No data-comment-id appears more than once.
      const ids = ['1', '2', '11', '12', '21', '111', '1111', '11111']
      for (const id of ids) {
        await expect(page.locator(`[data-comment-id="${id}"]`)).toHaveCount(1)
      }
      await expect(s.locator('.recursive-comments-reactions')).toHaveText('21')
    })

    test('adding a reply at depth 4 creates a depth-5 node and updates max-depth', async ({ page }) => {
      const s = section(page)
      const deep = s.locator('[data-comment-id="11111"]')
      await deep.locator('.comment-toggle-form').click()
      await deep.locator('.comment-reply-textarea').fill('a reply at depth 5')
      await deep.locator('.comment-post-reply-btn').click()

      await expect(s.locator('[data-depth="5"]')).toHaveCount(1)
      await expect(s.locator('[data-depth="5"] .comment-text')).toHaveText('a reply at depth 5')
      await expect(s.locator('.recursive-comments-total')).toHaveText('9')
      await expect(s.locator('.recursive-comments-max-depth')).toHaveText('6')
    })

    test('editing at depth 2 updates only that node', async ({ page }) => {
      const s = section(page)
      const node = s.locator('[data-comment-id="111"]')
      // .first() since descendants (1111, 11111) also have a .comment-edit-btn.
      await node.locator('.comment-edit-btn').first().click()
      const ta = node.locator('.comment-edit-textarea').first()
      await ta.fill('edited at depth 2')
      await node.locator('.comment-save-btn').first().click()
      await expect(node.locator('.comment-text').first()).toHaveText('edited at depth 2')
      // Sibling at same depth (id=12) untouched.
      await expect(s.locator('[data-comment-id="12"] .comment-text').first()).not.toHaveText('edited at depth 2')
    })

    test('deleting a non-leaf node removes its descendants', async ({ page }) => {
      const s = section(page)
      // id=11 has descendants 111, 1111, 11111. .first() picks id=11's own button
      // (descendants' delete buttons match too because they nest inside id=11).
      await s.locator('[data-comment-id="11"]').locator('.comment-delete-btn').first().click()
      await expect(s.locator('[data-comment-id="11"]')).toHaveCount(0)
      await expect(s.locator('[data-comment-id="111"]')).toHaveCount(0)
      await expect(s.locator('[data-comment-id="1111"]')).toHaveCount(0)
      await expect(s.locator('[data-comment-id="11111"]')).toHaveCount(0)
      // Sibling 12 and root 2 still present.
      await expect(s.locator('[data-comment-id="12"]')).toHaveCount(1)
      await expect(s.locator('[data-comment-id="2"]')).toHaveCount(1)
      await expect(s.locator('.recursive-comments-total')).toHaveText('4')
    })
  })

  // --- Cross-Depth Context Propagation ---

  test.describe('Context Propagation', () => {
    test('action handlers reach leaf nodes through unbounded recursion', async ({ page }) => {
      const s = section(page)
      // Click the leaf's reply form toggle — this exercises useContext at depth 4.
      const deep = s.locator('[data-comment-id="11111"]')
      await deep.locator('.comment-toggle-form').click()
      await expect(deep.locator('.comment-reply-textarea')).toBeVisible()
      // No console errors should have fired (`api` resolving to undefined would
      // throw `Cannot read properties of undefined`).
    })
  })

  // --- New Top-Level Comment ---

  test.describe('Top-Level Posting', () => {
    test('posting a new top-level comment prepends it', async ({ page }) => {
      const s = section(page)
      await s.locator('.recursive-comments-input').fill('A brand-new thread')
      await s.locator('.recursive-comments-post').click()
      await expect(s.locator('.recursive-comments-total')).toHaveText('9')
      // First root has the new text.
      const firstRoot = s.locator('.recursive-comments-roots > li').first()
      await expect(firstRoot.locator('[data-depth="0"] .comment-text').first()).toHaveText('A brand-new thread')
    })

    test('replying twice to a CSR-created top-level comment does not duplicate the second reply', async ({ page }) => {
      // Regression for the post-#1224 follow-up bug: posting test1 (CSR
      // root), replying test2, then replying test3 produced two test3
      // nodes because `insert()` was leaking branch-template signal reads
      // into the surrounding createDisposableEffect, spawning a duplicate
      // inner mapArray instance on every parent-signal change.
      const s = section(page)

      // Post test1 as a new root comment, then anchor it by the auto-
      // assigned data-comment-id so subsequent locators don't depend on
      // DOM ordering as the tree grows.
      await s.locator('.recursive-comments-input').fill('test1')
      await s.locator('.recursive-comments-post').click()
      const firstRoot = s.locator('.recursive-comments-roots > li').first()
      const test1Id = await firstRoot.locator('[data-comment-id]').first().getAttribute('data-comment-id')
      expect(test1Id).toBeTruthy()
      const test1 = s.locator(`[data-comment-id="${test1Id}"]`)
      await expect(test1).toHaveCount(1)

      // Within a CommentNode subtree, the node's own controls render in
      // document order BEFORE its `.comment-children` block (where any
      // descendant CommentNode lives with its own controls). `.first()`
      // therefore consistently picks the *self* control of `subject`.
      const replyTo = async (subject: ReturnType<typeof s.locator>, text: string) => {
        await subject.locator('.comment-toggle-form').first().click()
        const ta = subject.locator('.comment-reply-textarea').first()
        await expect(ta).toBeVisible()
        await ta.fill(text)
        await subject.locator('.comment-post-reply-btn').first().click()
        // Verify the new comment landed exactly once before the next step,
        // so we never measure the increment against partial DOM state.
        await expect(
          s.locator('.comment-text').filter({ hasText: new RegExp(`^${text}$`) }),
        ).toHaveCount(1)
      }

      await replyTo(test1, 'test2')
      await replyTo(test1, 'test3')

      // Final assertions are scoped to the entire section and use exact
      // text matches on individual `.comment-text` elements — so a
      // duplicate-node regression cannot hide behind ancestor `hasText`
      // (which matches any subtree containing the string).
      await expect(s.locator('.comment-text').filter({ hasText: /^test3$/ })).toHaveCount(1)
      await expect(s.locator('.comment-text').filter({ hasText: /^test2$/ })).toHaveCount(1)
      await expect(s.locator('.comment-text').filter({ hasText: /^test1$/ })).toHaveCount(1)
      // Stat strip should reflect 8 seeded + 3 new comments.
      await expect(s.locator('.recursive-comments-total')).toHaveText('11')
    })
  })
})
