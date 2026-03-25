import { test, expect } from '@playwright/test'

test.describe('Mail Inbox Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser error:', msg.text())
      }
    })
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/mail')
  })

  test.describe('Mail List', () => {
    test('renders all mail items', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      const mailRows = section.locator('.mail-row')
      await expect(mailRows).toHaveCount(6)
    })

    test('renders mail sender and subject', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      await expect(section.locator('.mail-from:has-text("Alice Johnson")').first()).toBeVisible()
      await expect(section.locator('.mail-subject:has-text("Q4 Planning Meeting")').first()).toBeVisible()
      await expect(section.locator('.mail-from:has-text("Bob Smith")').first()).toBeVisible()
    })

    test('shows "New" badge for unread mails', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      const aliceRow = section.locator('.mail-row').first()
      await expect(aliceRow.locator('[data-slot="badge"]:has-text("New")')).toBeVisible()
    })

    test('unread mails have bold sender name', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      const aliceFrom = section.locator('.mail-from:has-text("Alice Johnson")').first()
      await expect(aliceFrom).toHaveClass(/font-semibold/)
    })
  })

  test.describe('Mail Detail', () => {
    test('shows empty state when no mail selected', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      await expect(section.locator('.mail-empty')).toBeVisible()
      await expect(section.locator('text=Select an email to read')).toBeVisible()
    })

    test('clicking a mail shows detail panel', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      // Click on the mail content area (not checkbox/star) to select
      await section.locator('.mail-content').first().click()

      await expect(section.locator('.mail-detail')).toBeVisible()
      await expect(section.locator('.mail-detail-subject')).toContainText('Q4 Planning Meeting')
      await expect(section.locator('.mail-detail-from')).toContainText('Alice Johnson')
    })

    test('clicking a mail shows full body', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      await section.locator('.mail-content').first().click()

      await expect(section.locator('.mail-body')).toContainText('Q4 roadmap')
    })

    test('selecting a mail marks it as read', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      const firstRow = section.locator('.mail-row').first()
      await expect(firstRow.locator('[data-slot="badge"]:has-text("New")')).toBeVisible()

      // Click content to select
      await section.locator('.mail-content').first().click()

      // New badge should disappear (now read)
      await expect(firstRow.locator('[data-slot="badge"]:has-text("New")')).not.toBeVisible()
    })
  })

  test.describe('Search', () => {
    test('search filters mails by sender', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      const searchInput = section.locator('input[placeholder="Search mail..."]')

      await searchInput.fill('Alice')

      const mailRows = section.locator('.mail-row')
      await expect(mailRows).toHaveCount(1)
      await expect(section.locator('.mail-from:has-text("Alice Johnson")').first()).toBeVisible()
    })

    test('search filters mails by subject', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      const searchInput = section.locator('input[placeholder="Search mail..."]')

      await searchInput.fill('Security')

      const mailRows = section.locator('.mail-row')
      await expect(mailRows).toHaveCount(1)
      await expect(section.locator('.mail-from:has-text("Eve Davis")').first()).toBeVisible()
    })

    test('search with no match shows empty list', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      const searchInput = section.locator('input[placeholder="Search mail..."]')

      await searchInput.fill('nonexistent query xyz')

      const mailRows = section.locator('.mail-row')
      await expect(mailRows).toHaveCount(0)
    })

    test('clearing search restores all mails', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      const searchInput = section.locator('input[placeholder="Search mail..."]')

      await searchInput.fill('Alice')
      await expect(section.locator('.mail-row')).toHaveCount(1)

      await searchInput.fill('')
      await expect(section.locator('.mail-row')).toHaveCount(6)
    })

    test('count display updates with search', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      const count = section.locator('.mail-count')

      await expect(count).toContainText('6 of 6')

      const searchInput = section.locator('input[placeholder="Search mail..."]')
      await searchInput.fill('Alice')
      await expect(count).toContainText('1 of 6')
    })
  })

  test.describe('Star Toggle', () => {
    test('clicking star toggles starred state', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      // Bob (2nd row) is initially not starred
      const bobRow = section.locator('.mail-row').nth(1)
      const starButton = bobRow.locator('.star-button')

      // Initially not starred
      await expect(starButton).toContainText('\u2606')

      // Click to star
      await starButton.click()

      // Should be starred
      await expect(starButton).toContainText('\u2605')
    })

    test('unstar a starred mail', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      // Alice (1st row) is initially starred
      const aliceRow = section.locator('.mail-row').first()
      const starButton = aliceRow.locator('.star-button')

      // Initially starred
      await expect(starButton).toContainText('\u2605')

      // Click to unstar
      await starButton.click()

      // Should be unstarred
      await expect(starButton).toContainText('\u2606')
    })
  })

  test.describe('Delete with Dialog', () => {
    test('delete button opens confirmation dialog', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      // Select first mail
      await section.locator('.mail-content').first().click()
      await expect(section.locator('.mail-detail')).toBeVisible()

      // Click delete in the detail panel
      await section.locator('.mail-detail button:has-text("Delete")').click()

      // AlertDialog should appear
      const alertDialog = page.locator('[role="alertdialog"][aria-labelledby="delete-mail-title"]')
      await expect(alertDialog).toBeVisible()
      await expect(alertDialog.locator('text=Are you sure you want to delete')).toBeVisible()
    })

    test('cancel closes dialog without deleting', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      await section.locator('.mail-content').first().click()
      await section.locator('.mail-detail button:has-text("Delete")').click()

      const alertDialog = page.locator('[role="alertdialog"][aria-labelledby="delete-mail-title"]')
      await expect(alertDialog).toBeVisible()

      // Use force click — dialog portals to body but Example preview container may overlap
      await alertDialog.locator('button:has-text("Cancel")').click({ force: true })
      await expect(alertDialog).toHaveCSS('opacity', '0')

      // Mail should still be there
      await expect(section.locator('.mail-row')).toHaveCount(6)
    })
  })

  test.describe('Select All', () => {
    test('select all checkbox selects all visible mails', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')
      const selectAllCheckbox = checkboxes.first()

      await selectAllCheckbox.click()

      // All mail checkboxes should be checked
      const mailCheckboxes = section.locator('.mail-row button[role="checkbox"]')
      const count = await mailCheckboxes.count()
      for (let i = 0; i < count; i++) {
        await expect(mailCheckboxes.nth(i)).toHaveAttribute('aria-checked', 'true')
      }
    })

    test('select all shows delete selected button', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      const checkboxes = section.locator('button[role="checkbox"]')
      const selectAllCheckbox = checkboxes.first()

      await expect(section.locator('button:has-text("Delete selected")')).not.toBeVisible()

      await selectAllCheckbox.click()

      await expect(section.locator('button:has-text("Delete selected")')).toBeVisible()
    })
  })

  test.describe('Read/Unread Toggle', () => {
    test('selecting unread mail shows Mark unread button', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      // Click Alice (unread) — it becomes read on selection
      await section.locator('.mail-content').first().click()

      // Should show "Mark unread" since it's now read (auto-marked on selection)
      await expect(section.locator('.read-toggle-text')).toContainText('Mark unread')
    })

    test('selecting already read mail shows Mark unread button', async ({ page }) => {
      const section = page.locator('[bf-s^="MailInboxDemo_"]:not([data-slot])').first()
      // Bob (2nd row) is already read
      await section.locator('.mail-content').nth(1).click()

      // Should show "Mark unread" since Bob is already read
      await expect(section.locator('.read-toggle-text')).toContainText('Mark unread')
    })
  })
})
