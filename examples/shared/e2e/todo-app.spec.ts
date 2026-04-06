/**
 * Shared TodoApp Component E2E Tests
 *
 * Exports test functions that can be imported by adapter examples.
 * Tests follow TodoMVC HTML structure conventions.
 */

import { test, expect } from '@playwright/test'

/**
 * Run TodoApp component E2E tests.
 *
 * @param baseUrl - The base URL of the server (e.g., 'http://localhost:3001')
 * @param todosPath - The path to the todos page (default: '/todos')
 */
export function todoAppTests(baseUrl: string, todosPath: string = '/todos') {
  // Run TodoApp tests serially to avoid server state conflicts
  test.describe.serial('TodoApp Component', () => {
    // Increase timeout for TodoApp tests (hydration can take time)
    test.setTimeout(30000)

    test.beforeEach(async ({ page, request }) => {
      // Reset server state before each test
      await request.post(`${baseUrl}/api/todos/reset`)
      await page.goto(`${baseUrl}${todosPath}`)
      // Wait for todoapp to be loaded
      await page.waitForSelector('.todoapp')
      await page.waitForSelector('.todo-list li', { timeout: 10000 })
      // Wait for TodoItem components to be fully hydrated with event handlers bound
      // SSR renders as bf-s="TodoApp_xxx_slot_N", hydrated renders as bf-s="TodoItem_xxx"
      // Wait for TodoItem components to be hydrated (bf-s attribute indicates scope)
      await page.waitForSelector('.todo-list li[bf-s*="TodoItem_"]', { timeout: 10000 })
    })

    test('displays initial todos', async ({ page }) => {
      // Check page title
      await expect(page.locator('.todoapp h1')).toContainText('todos')

      // Check initial todos are displayed
      await expect(page.locator('.todo-list li')).toHaveCount(3)
      await expect(page.locator('.todo-list li').nth(0)).toContainText('Setup project')
      await expect(page.locator('.todo-list li').nth(1)).toContainText('Create components')
      await expect(page.locator('.todo-list li').nth(2)).toContainText('Write tests')
    })

    test('displays active count', async ({ page }) => {
      // Check active counter shows "2 items left" (plural, with proper spacing)
      // This verifies: 1) count is correct, 2) plural form "items", 3) space between number and text
      await expect(page.locator('.todo-count')).toContainText('2 items left')
    })

    test('adds a new todo', async ({ page }) => {
      const initialCount = await page.locator('.todo-list li').count()

      // Type new todo text and press Enter
      await page.fill('input.new-todo', 'New task from Playwright')
      await page.press('input.new-todo', 'Enter')

      // Wait for new item to appear
      await expect(page.locator('.todo-list li')).toHaveCount(initialCount + 1)

      // Verify new todo is in the list
      await expect(page.locator('.todo-list li').last()).toContainText('New task from Playwright')
    })

    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('toggles todo done state with checkbox', async ({ page }) => {
      // Find first checkbox and click it (force: true because TodoMVC CSS hides checkbox with opacity: 0)
      const checkbox = page.locator('.todo-list li').first().locator('input.toggle')
      await checkbox.click({ force: true })

      // Wait for item to have completed class
      await expect(page.locator('.todo-list li').first()).toHaveClass(/completed/)

      // Active count should decrease and show singular form "1 item left" (with proper spacing)
      await expect(page.locator('.todo-count')).toContainText('1 item left')
    })

    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('toggles todo back to not done', async ({ page }) => {
      // Find "Write tests" which is already completed (third item) and click its checkbox
      // force: true because TodoMVC CSS hides checkbox with opacity: 0
      const completedCheckbox = page.locator('.todo-list li').nth(2).locator('input.toggle')
      await completedCheckbox.click({ force: true })

      // Wait for item to not have completed class
      await expect(page.locator('.todo-list li').nth(2)).not.toHaveClass(/completed/)

      // Active count should increase to 3
      await expect(page.locator('.todo-count')).toContainText('3')
    })

    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('enters edit mode on double-click', async ({ page }) => {
      // Double-click on todo label to enter edit mode
      await page.dblclick('.todo-list li:first-child label')

      // Should show editing class and edit input
      await expect(page.locator('.todo-list li').first()).toHaveClass(/editing/)
      await expect(page.locator('.todo-list li:first-child input.edit')).toBeVisible()
    })

    // TODO(#730): per-item signals — loop-param conditional/event accessor not yet reactive
    test.skip('edits todo text', async ({ page }) => {
      // Double-click on todo label to enter edit mode
      await page.dblclick('.todo-list li:first-child label')

      // Clear and type new text
      const input = page.locator('.todo-list li:first-child input.edit')
      await input.fill('Updated project setup')

      // Press Enter to save
      await input.press('Enter')

      // Verify text is updated
      await expect(page.locator('.todo-list li').first()).toContainText('Updated project setup')
    })

    test('deletes a todo', async ({ page }) => {
      const initialCount = await page.locator('.todo-list li').count()

      // Hover over first item to show destroy button
      await page.hover('.todo-list li:first-child')

      // Click destroy button
      await page.locator('.todo-list li:first-child button.destroy').click()

      // Wait for item to be removed
      await expect(page.locator('.todo-list li')).toHaveCount(initialCount - 1)

      // First todo should no longer be "Setup project"
      await expect(page.locator('.todo-list li').first()).not.toContainText('Setup project')
    })

    test('filters todos - All', async ({ page }) => {
      // Click All filter
      await page.click('.filters a:has-text("All")')

      // Should show all 3 todos
      await expect(page.locator('.todo-list li')).toHaveCount(3)

      // All filter should be selected
      await expect(page.locator('.filters a:has-text("All")')).toHaveClass(/selected/)
    })

    test('filters todos - Active', async ({ page }) => {
      // Click Active filter
      await page.click('.filters a:has-text("Active")')

      // Should show only 2 active todos (Setup project, Create components)
      await expect(page.locator('.todo-list li')).toHaveCount(2)

      // Active filter should be selected
      await expect(page.locator('.filters a:has-text("Active")')).toHaveClass(/selected/)

      // Should not show completed todo
      await expect(page.locator('.todo-list li')).not.toContainText(['Write tests'])
    })

    test('filters todos - Completed', async ({ page }) => {
      // Click Completed filter
      await page.click('.filters a:has-text("Completed")')

      // Should show only 1 completed todo (Write tests)
      await expect(page.locator('.todo-list li')).toHaveCount(1)

      // Completed filter should be selected
      await expect(page.locator('.filters a:has-text("Completed")')).toHaveClass(/selected/)

      // Should only show completed todo
      await expect(page.locator('.todo-list li').first()).toContainText('Write tests')
    })

    test('filters on direct URL access - #/active', async ({ page, request }) => {
      // Reset server state
      await request.post(`${baseUrl}/api/todos/reset`)

      // Navigate directly to /todos#/active
      await page.goto(`${baseUrl}${todosPath}#/active`)
      await page.waitForSelector('.todoapp')
      // Wait for hydration + filter application (hash filter may reduce visible items)
      await page.waitForSelector('.todo-list li', { timeout: 15000 })

      // Should show only 2 active todos (wait for filter to settle)
      await expect(page.locator('.todo-list li')).toHaveCount(2, { timeout: 10000 })

      // Active filter should be selected
      await expect(page.locator('.filters a:has-text("Active")')).toHaveClass(/selected/)

      // Should not show completed todo "Write tests"
      await expect(page.locator('.todo-list li')).not.toContainText(['Write tests'])
    })

    test('filters on direct URL access - #/completed', async ({ page, request }) => {
      // Reset server state
      await request.post(`${baseUrl}/api/todos/reset`)

      // Navigate directly to /todos#/completed
      await page.goto(`${baseUrl}${todosPath}#/completed`)
      await page.waitForSelector('.todoapp')
      // Wait for hydration + filter application (hash filter may reduce visible items)
      await page.waitForSelector('.todo-list li', { timeout: 15000 })

      // Should show only 1 completed todo (wait for filter to settle)
      await expect(page.locator('.todo-list li')).toHaveCount(1, { timeout: 10000 })

      // Completed filter should be selected
      await expect(page.locator('.filters a:has-text("Completed")')).toHaveClass(/selected/)

      // Should only show completed todo
      await expect(page.locator('.todo-list li').first()).toContainText('Write tests')
    })

    test('clears completed todos', async ({ page }) => {
      // Clear completed button should be visible (Write tests is done)
      await expect(page.locator('.clear-completed')).toBeVisible()

      // Click clear completed
      await page.click('.clear-completed')

      // Should now have 2 todos
      await expect(page.locator('.todo-list li')).toHaveCount(2)

      // "Write tests" should be removed
      await expect(page.locator('.todo-list li')).not.toContainText(['Write tests'])

      // Clear completed button should be hidden (no more completed todos)
      await expect(page.locator('.clear-completed')).not.toBeVisible()
    })
  })
}
