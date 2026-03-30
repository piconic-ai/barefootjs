import { test, expect } from '@playwright/test'

test.describe('Tasks Table Block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/tasks-table')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="TasksTableDemo_"]:not([data-slot])').first()

  test.describe('Initial Rendering', () => {
    test('shows 5 rows on first page', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.task-row')).toHaveCount(5)
    })

    test('shows 12 total tasks', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=12 total')).toBeVisible()
    })

    test('shows page 1 of 3', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=Page 1 of 3')).toBeVisible()
    })
  })

  test.describe('Sorting', () => {
    test('clicking Title header sorts by title', async ({ page }) => {
      const s = section(page)
      await s.locator('button:has-text("Title")').click()

      // First task should be alphabetically first
      const firstTitle = s.locator('.task-title').first()
      await expect(firstTitle).toHaveText('Add dark mode support')
    })

    test('clicking again reverses sort', async ({ page }) => {
      const s = section(page)
      const titleHeader = s.locator('button:has-text("Title")')
      await titleHeader.click()
      await titleHeader.click()

      // Should be reverse alphabetical
      const firstTitle = s.locator('.task-title').first()
      await expect(firstTitle).toHaveText('Write onboarding guide')
    })
  })

  test.describe('Filtering', () => {
    test('text filter narrows results', async ({ page }) => {
      const s = section(page)
      await s.locator('input[placeholder="Filter tasks..."]').fill('fix')

      // Should show tasks with "fix" in title or id
      const rows = s.locator('.task-row')
      await expect(rows).toHaveCount(3) // Fix login redirect bug, Fix memory leak, Fix typo in README
    })

    test('status filter shows only matching tasks', async ({ page }) => {
      const s = section(page)
      await s.locator('.status-filter').selectOption('done')

      const rows = s.locator('.task-row')
      await expect(rows).toHaveCount(3) // 3 done tasks
    })

    test('combined filter + status narrows further', async ({ page }) => {
      const s = section(page)
      await s.locator('.status-filter').selectOption('todo')
      await s.locator('input[placeholder="Filter tasks..."]').fill('database')

      await expect(s.locator('.task-row')).toHaveCount(1)
      await expect(s.locator('.task-title').first()).toHaveText('Migrate to new database')
    })
  })

  test.describe('Pagination', () => {
    test('next page shows different rows', async ({ page }) => {
      const s = section(page)
      const firstPageTitle = await s.locator('.task-id').first().textContent()

      // Click next
      await s.locator('button:has-text("Next")').last().click()
      await expect(s.locator('text=Page 2 of 3')).toBeVisible()

      const secondPageTitle = await s.locator('.task-id').first().textContent()
      expect(firstPageTitle).not.toBe(secondPageTitle)
    })
  })

  test.describe('Row Selection', () => {
    test('clicking row checkbox shows selected count', async ({ page }) => {
      const s = section(page)
      const checkboxes = s.locator('.task-row button[role="checkbox"]')

      await checkboxes.first().click()
      await expect(s.locator('.selected-count')).toContainText('1 selected')
    })

    test('select all selects all on current page', async ({ page }) => {
      const s = section(page)
      // Select all checkbox is in the header
      const selectAll = s.locator('thead button[role="checkbox"]')
      await selectAll.click()

      await expect(s.locator('.selected-count')).toContainText('5 selected')
    })
  })

  test.describe('Bulk Actions', () => {
    test('delete selected removes tasks', async ({ page }) => {
      const s = section(page)
      // Select first row
      await s.locator('.task-row button[role="checkbox"]').first().click()

      // Delete
      await s.locator('button:has-text("Delete")').click()

      // Should show 11 total now
      await expect(s.locator('text=11 total')).toBeVisible()
    })
  })
})
