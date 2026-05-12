import { test, expect } from '@playwright/test'

const routes = [
  { path: '/gallery/productivity/mail', key: 'mail', title: 'Mail' },
  { path: '/gallery/productivity/files', key: 'files', title: 'Files' },
  { path: '/gallery/productivity/board', key: 'board', title: 'Board' },
  { path: '/gallery/productivity/calendar', key: 'calendar', title: 'Calendar' },
] as const

test.describe('Gallery: Productivity app', () => {
  test.describe('Layout', () => {
    test('each route renders the productivity shell with the correct title and active sidebar item', async ({ page }) => {
      for (const route of routes) {
        await page.goto(route.path)
        await expect(page.locator('[data-productivity-sidebar]')).toBeVisible()
        await expect(page.locator('.productivity-page-title')).toHaveText(route.title)

        const active = page.locator(`[data-productivity-nav-item="${route.key}"]`)
        await expect(active).toHaveAttribute('data-active', 'true')
        await expect(active).toHaveAttribute('aria-current', 'page')

        const inactiveCount = await page
          .locator('[data-productivity-nav-item][data-active="false"]')
          .count()
        expect(inactiveCount).toBe(routes.length - 1)
      }
    })

    test('gallery meta link is outside the productivity shell', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')
      const githubLinks = page.locator('a[href*="components/gallery/productivity"]')
      await expect(githubLinks).toHaveCount(1)
      const insideShell = await page
        .locator('.productivity-shell a[href*="components/gallery/productivity"]')
        .count()
      expect(insideShell).toBe(0)
    })
  })

  test.describe('Navigation', () => {
    test('navigates between all productivity routes via the sidebar', async ({ page }) => {
      await page.goto(routes[0].path)

      for (const target of routes) {
        await page.locator(`[data-productivity-sidebar] [data-productivity-nav-item="${target.key}"]`).click()
        await page.waitForURL(`**${target.path}`)
        await expect(page).toHaveURL(new RegExp(`${target.path}$`))
        await expect(page.locator('.productivity-page-title')).toHaveText(target.title)
        await expect(
          page.locator(`[data-productivity-nav-item="${target.key}"]`)
        ).toHaveAttribute('data-active', 'true')
      }
    })
  })

  test.describe('Mail page', () => {
    test('renders mail inbox with multiple messages', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')
      const mailRows = page.locator('.mail-row')
      await expect(mailRows.first()).toBeVisible()
      const count = await mailRows.count()
      expect(count).toBeGreaterThan(0)
    })

    test('clicking a mail marks it as read and shows detail panel', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')

      // Click first unread mail (has "New" badge)
      await page.locator('.mail-row').first().locator('.mail-content').click()

      // Detail panel should appear
      await expect(page.locator('.mail-detail')).toBeVisible()
      await expect(page.locator('.mail-detail-subject')).toBeVisible()
    })

    test('search filters the mail list', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')

      const initialCount = await page.locator('.mail-row').count()
      await page.locator('input[placeholder="Search mail..."]').fill('Q4')

      const filteredCount = await page.locator('.mail-row').count()
      expect(filteredCount).toBeLessThan(initialCount)
    })
  })

  test.describe('Cross-page state', () => {
    test('unread mail badge appears in sidebar after visiting mail page', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')

      // Mail page initializes with unread mails → writes to sessionStorage
      // Badge should appear on mail nav item
      await expect(page.locator('[data-productivity-sidebar] .productivity-unread-count')).toBeVisible()
      const badgeText = await page.locator('[data-productivity-sidebar] .productivity-unread-count').textContent()
      const initialUnread = parseInt(badgeText ?? '0', 10)
      expect(initialUnread).toBeGreaterThan(0)

      // Navigate to files page — badge should persist from sessionStorage
      await page.locator('[data-productivity-sidebar] [data-productivity-nav-item="files"]').click()
      await page.waitForURL('**/gallery/productivity/files')

      await expect(page.locator('[data-productivity-sidebar] .productivity-unread-count')).toBeVisible()
      await expect(page.locator('[data-productivity-sidebar] .productivity-unread-count')).toHaveText(String(initialUnread))
    })

    test('board drag-preview CSS vars flip on pointerdown of a nested task card', async ({ page }) => {
      // Locks down the per-item reactive `style={{'--drag-opacity': …,
      // '--drag-scale': …, '--drag-shadow': …, '--drag-ring': …}}`
      // binding on the root element of a NESTED `tasks.map()` body.
      // Before #135 the inner-loop renderItem never emitted a
      // `createEffect` for the root's `style` attribute, so the
      // variables stayed at the SSR value and the card never reacted.
      //
      // The visual story (opacity fade + lift via scale/shadow +
      // primary-coloured outline) is encoded across multiple CSS
      // variables on the same `style` literal — exercising a richer
      // object-style binding than the original single-var shape.
      await page.goto('/gallery/productivity/board')

      const card = page.locator('[data-task-id="1"]')
      await expect(card).toBeVisible()
      await expect(card).toHaveAttribute('data-task-dragging', 'false')
      await expect(card).toHaveAttribute('style', /--drag-opacity\s*:\s*1/)
      await expect(card).toHaveAttribute('style', /--drag-scale\s*:\s*1/)
      // Idle outline is transparent — no visible ring.
      await expect(card).toHaveAttribute('style', /--drag-ring\s*:\s*2px\s+solid\s+transparent/)

      // pointerdown — same card flips to dragging state on every
      // tracked variable.
      await card.dispatchEvent('pointerdown')
      await expect(card).toHaveAttribute('data-task-dragging', 'true')
      await expect(card).toHaveAttribute('style', /--drag-opacity\s*:\s*0\.55/)
      await expect(card).toHaveAttribute('style', /--drag-scale\s*:\s*1\.03/)
      await expect(card).toHaveAttribute('style', /--drag-shadow\s*:\s*0\s+12px\s+24px/)
      await expect(card).toHaveAttribute('style', /--drag-ring\s*:\s*2px\s+solid\s+var\(--color-primary/)

      // Releasing the pointer brings the card back to the idle state.
      await card.dispatchEvent('pointerup')
      await expect(card).toHaveAttribute('data-task-dragging', 'false')
      await expect(card).toHaveAttribute('style', /--drag-opacity\s*:\s*1/)
      await expect(card).toHaveAttribute('style', /--drag-scale\s*:\s*1/)
      await expect(card).toHaveAttribute('style', /--drag-ring\s*:\s*2px\s+solid\s+transparent/)
    })

    test('board: arrow buttons survive moving a task between columns', async ({ page }) => {
      // Regression for the slot-resolver name-prefix over-match (#135):
      // a freshly-inserted inner-loop item carries three same-name
      // <Button> children (delete-task + move-left + move-right). After
      // the first `upsertChild` mounted the delete button, the second
      // and third found that already-mounted Button via the legacy
      // name-prefix selector and `initChild`-ed it again — leaving the
      // arrow placeholders orphaned. The visible symptom: clicking ←
      // or → moved the task into a different column but the arrow
      // buttons disappeared from the moved card, breaking subsequent
      // moves.
      await page.goto('/gallery/productivity/board')

      // Task 1 starts in "To Do" with three buttons on the card
      // (delete + left + right). The To Do column has no neighbour to
      // the left, so move-left is a no-op there — we move right.
      const card = page.locator('[data-task-id="1"]')
      await expect(card).toBeVisible()
      await expect(card.locator('.delete-task')).toHaveCount(1)
      await expect(card.locator('.move-left')).toHaveCount(1)
      await expect(card.locator('.move-right')).toHaveCount(1)

      // Move task 1 from To Do → In Progress.
      await card.locator('.move-right').click()

      const movedCard = page.locator('[data-task-id="1"]')
      // The data-task-id locator now resolves to the SAME id, but in
      // the new column. The three buttons must still exist on the
      // freshly-inserted card.
      await expect(movedCard.locator('.delete-task')).toHaveCount(1)
      await expect(movedCard.locator('.move-left')).toHaveCount(1)
      await expect(movedCard.locator('.move-right')).toHaveCount(1)

      // And the buttons must be wired — moving once more lands the
      // task in "Done".
      await movedCard.locator('.move-right').click()
      const doneCard = page.locator('[data-task-id="1"]')
      await expect(doneCard.locator('.move-left')).toHaveCount(1)
      await expect(doneCard.locator('.move-right')).toHaveCount(1)
    })

    test('reading a mail reduces the unread badge count', async ({ page }) => {
      await page.goto('/gallery/productivity/mail')

      // Get initial unread count
      await expect(page.locator('[data-productivity-sidebar] .productivity-unread-count')).toBeVisible()
      const initialText = await page.locator('[data-productivity-sidebar] .productivity-unread-count').textContent()
      const initialCount = parseInt(initialText ?? '0', 10)

      // Click an unread mail to mark it as read
      await page.locator('.mail-row').filter({ has: page.locator('.mail-content [class*="font-semibold"]') }).first().locator('.mail-content').click()

      // After selecting, unread count should decrease
      const newText = await page.locator('[data-productivity-sidebar] .productivity-unread-count').textContent()
      const newCount = parseInt(newText ?? '0', 10)
      expect(newCount).toBeLessThan(initialCount)
    })
  })
})
