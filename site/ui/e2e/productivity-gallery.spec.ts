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

    test('board: drag-and-drop moves a task between columns and highlights the drop target', async ({ page }) => {
      // Trello/Notion-style cross-column drag. The card publishes
      // {taskId, fromColId} on `dragstart`, the column reads it on
      // `drop` and calls `moveTaskTo`. While the dragged card is
      // over a column, the column root's `--drop-active` CSS var
      // (bound on the OUTER `.map()` body root) flips to '1' and a
      // dashed outline appears — exercising a reactive-style binding
      // at the outer loop nesting level (one above the existing
      // inner-loop task-card `--drag-*` test).
      await page.goto('/gallery/productivity/board')

      const card = page.locator('[data-task-id="1"]')
      await expect(card).toBeVisible()

      const todoCol = page.locator('[data-col-id="todo"]')
      const doneCol = page.locator('[data-col-id="done"]')

      // Task 1 starts in To Do — sanity check.
      await expect(todoCol.locator('[data-task-id="1"]')).toHaveCount(1)
      await expect(doneCol.locator('[data-task-id="1"]')).toHaveCount(0)

      // Idle: outline is transparent (no drop-active highlight).
      await expect(doneCol).toHaveAttribute('data-col-drop-active', 'false')
      await expect(doneCol).toHaveAttribute('style', /--drop-active\s*:\s*0/)

      // Drive dragstart + dragover from inside the page so the same
      // DataTransfer instance is shared across events (Playwright's
      // dispatchEvent serializes its eventInit, which would lose the
      // DataTransfer payload otherwise).
      await page.evaluate(() => {
        const dt = new DataTransfer()
        const src = document.querySelector('[data-task-id="1"]') as HTMLElement
        const dst = document.querySelector('[data-col-id="done"]') as HTMLElement
        src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
        dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
      })

      // Drop target column is now highlighted.
      await expect(doneCol).toHaveAttribute('data-col-drop-active', 'true')
      await expect(doneCol).toHaveAttribute('style', /--drop-active\s*:\s*1/)
      await expect(doneCol).toHaveAttribute('style', /outline\s*:\s*2px\s+dashed\s+var\(--color-primary/)

      // Complete the gesture: drop on Done, dragend on the source.
      await page.evaluate(() => {
        const dt = new DataTransfer()
        dt.setData('application/task', JSON.stringify({ taskId: 1, fromColId: 'todo' }))
        const dst = document.querySelector('[data-col-id="done"]') as HTMLElement
        const src = document.querySelector('[data-task-id="1"]') as HTMLElement
        dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
        src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
      })

      // Task 1 has moved out of To Do and into Done.
      await expect(todoCol.locator('[data-task-id="1"]')).toHaveCount(0)
      await expect(doneCol.locator('[data-task-id="1"]')).toHaveCount(1)

      // And the drop-active highlight has cleared.
      await expect(doneCol).toHaveAttribute('data-col-drop-active', 'false')
      await expect(doneCol).toHaveAttribute('style', /--drop-active\s*:\s*0/)

      // Arrow buttons on the moved card still work — the moved card
      // can travel back via ← (Done → In Progress).
      const movedCard = page.locator('[data-task-id="1"]')
      await expect(movedCard.locator('.move-left')).toHaveCount(1)
      await movedCard.locator('.move-left').click()
      await expect(page.locator('[data-col-id="progress"] [data-task-id="1"]')).toHaveCount(1)
    })

    test('board: dropping a task onto its own column is a no-op', async ({ page }) => {
      // Same-column drop must not duplicate / lose the task, and the
      // drop-target highlight must clear afterwards.
      await page.goto('/gallery/productivity/board')

      const todoCol = page.locator('[data-col-id="todo"]')
      const initialCount = await todoCol.locator('[data-task-id]').count()

      await page.evaluate(() => {
        const dt = new DataTransfer()
        const src = document.querySelector('[data-task-id="1"]') as HTMLElement
        const dst = document.querySelector('[data-col-id="todo"]') as HTMLElement
        src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
        dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
        // Payload is already on `dt` (set by dragstart), so drop reads
        // the SAME values back out — exactly the production path.
        dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
        src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
      })

      // Same number of cards, same column.
      await expect(todoCol.locator('[data-task-id]')).toHaveCount(initialCount)
      await expect(todoCol.locator('[data-task-id="1"]')).toHaveCount(1)
      await expect(todoCol).toHaveAttribute('data-col-drop-active', 'false')
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

    test('board: same-name sibling buttons on an SSR card each wire to their own slot (#1371)', async ({ page }) => {
      // #1371 DoD — duplicate-prefix scenario at the HYDRATION boundary.
      // Every task card carries THREE same-name <Button> children
      // (delete-task, move-left, move-right) plus the column-level add
      // button, so a card is a cluster of siblings sharing the `Button_`
      // bf-s name prefix. Slot identity is the (bf-h, bf-m) pair, unique
      // by construction (#1249): each button must hydrate to its OWN slot
      // and keep its OWN onClick. If identity had collapsed back to the
      // name-prefix selector, two of the three would share wiring and a
      // click would fire the wrong handler.
      //
      // Distinct from the "arrow buttons survive moving a task" test
      // above (which exercises the CSR fresh-insert path, #135): this one
      // never re-inserts a card — it drives delete / ← / → on cards that
      // were rendered by SSR and hydrated in place, proving each sibling
      // resolved to a separate slot from the server-rendered shape alone.
      await page.goto('/gallery/productivity/board')

      const todoCol = page.locator('[data-col-id="todo"]')
      const progressCol = page.locator('[data-col-id="progress"]')
      const doneCol = page.locator('[data-col-id="done"]')

      // → on an SSR card: task 4 (In Progress) moves right into Done.
      // Proves move-right is wired to moveTask(..., 'right').
      await expect(progressCol.locator('[data-task-id="4"]')).toHaveCount(1)
      await progressCol.locator('[data-task-id="4"]').locator('.move-right').click()
      await expect(doneCol.locator('[data-task-id="4"]')).toHaveCount(1)
      await expect(progressCol.locator('[data-task-id="4"]')).toHaveCount(0)

      // ← on a different SSR card: task 5 (In Progress) moves left into
      // To Do. Proves move-left is a DISTINCT slot/handler from
      // move-right — not the same element reached twice via name prefix.
      await expect(progressCol.locator('[data-task-id="5"]')).toHaveCount(1)
      await progressCol.locator('[data-task-id="5"]').locator('.move-left').click()
      await expect(todoCol.locator('[data-task-id="5"]')).toHaveCount(1)
      await expect(progressCol.locator('[data-task-id="5"]')).toHaveCount(0)

      // delete (×) on an SSR card: task 3 (To Do) is removed, not moved.
      // Proves delete-task is its own slot — a collapsed identity would
      // have made × inherit a move handler (task would relocate, count
      // unchanged) instead of deleting.
      const totalBefore = await page.locator('[data-task-id]').count()
      await todoCol.locator('[data-task-id="3"]').locator('.delete-task').click()
      await expect(page.locator('[data-task-id="3"]')).toHaveCount(0)
      await expect(page.locator('[data-task-id]')).toHaveCount(totalBefore - 1)
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
