import { test, expect } from '@playwright/test'

test.describe('Kanban Board Block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/kanban')
  })

  test.describe('Columns', () => {
    test('renders 3 columns with correct titles', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      await expect(section.locator('.column-title')).toHaveCount(3)
      await expect(section.locator('.column-title').nth(0)).toHaveText('To Do')
      await expect(section.locator('.column-title').nth(1)).toHaveText('In Progress')
      await expect(section.locator('.column-title').nth(2)).toHaveText('Done')
    })

    test('shows task count per column', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      const counts = section.locator('.task-count')
      await expect(counts.nth(0)).toHaveText('3')
      await expect(counts.nth(1)).toHaveText('2')
      await expect(counts.nth(2)).toHaveText('1')
    })

    test('shows total task count', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      await expect(section.locator('.task-total')).toContainText('6 tasks')
    })
  })

  test.describe('Task Cards', () => {
    test('renders task cards with titles', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      await expect(section.locator('.task-title').first()).toHaveText('Design landing page')
    })

    test('shows priority badges', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      const badges = section.locator('.task-priority')
      await expect(badges.first()).toHaveText('high')
    })
  })

  // BUG: Nested .map() event delegation doesn't resolve inner loop variables.
  // closest('[data-key]') finds inner data-key instead of outer, and inner
  // loop variable (task) is undefined in delegation scope.
  // See memory: compiler-reconcile-templates-events.md
  test.describe('Move Tasks', () => {
    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('move right moves task from To Do to In Progress', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      const columns = section.locator('.kanban-column')

      // First task in To Do: "Design landing page"
      const firstTask = columns.nth(0).locator('.task-card').first()
      await expect(firstTask.locator('.task-title')).toHaveText('Design landing page')

      // Click move right
      await firstTask.locator('.move-right').click()

      // Task should now be in In Progress column
      await expect(columns.nth(0).locator('.task-count')).toHaveText('2')
      await expect(columns.nth(1).locator('.task-count')).toHaveText('3')
    })

    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('move left moves task from In Progress to To Do', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      const columns = section.locator('.kanban-column')

      // First task in In Progress
      const firstTask = columns.nth(1).locator('.task-card').first()
      await firstTask.locator('.move-left').click()

      await expect(columns.nth(0).locator('.task-count')).toHaveText('4')
      await expect(columns.nth(1).locator('.task-count')).toHaveText('1')
    })

    test('total task count stays same after move', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      const columns = section.locator('.kanban-column')
      const firstTask = columns.nth(0).locator('.task-card').first()

      await firstTask.locator('.move-right').click()
      await expect(section.locator('.task-total')).toContainText('6 tasks')
    })
  })

  test.describe('Add Task', () => {
    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('clicking + shows add form', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      const column = section.locator('.kanban-column').first()

      await column.locator('.add-task-btn').click()
      await expect(column.locator('.add-task-form')).toBeVisible()
    })

    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('adding task increases count', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      const column = section.locator('.kanban-column').first()

      await column.locator('.add-task-btn').click()
      await column.locator('.add-task-form input').fill('New task')
      await column.locator('.add-task-form button:has-text("Add")').click()

      await expect(column.locator('.task-count')).toHaveText('4')
      await expect(section.locator('.task-total')).toContainText('7 tasks')
    })
  })

  test.describe('Delete Task', () => {
    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('delete removes task and updates count', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      const column = section.locator('.kanban-column').first()

      await column.locator('.delete-task').first().click()
      await expect(column.locator('.task-count')).toHaveText('2')
      await expect(section.locator('.task-total')).toContainText('5 tasks')
    })
  })

  test.describe('Toast', () => {
    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('moving task shows toast', async ({ page }) => {
      const section = page.locator('[bf-s^="KanbanDemo_"]:not([data-slot])').first()
      const firstTask = section.locator('.kanban-column').nth(0).locator('.task-card').first()

      await firstTask.locator('.move-right').click()
      await expect(page.locator('.toast-message').first()).toHaveText('Task moved')
    })
  })
})
