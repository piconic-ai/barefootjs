/**
 * QueryTodoApp E2E tests: what the createQuery / createMutation version of
 * the todo app adds on top of the shared TodoMVC suite (todo-app.spec.ts).
 * The shared suite covers the visible behaviour; these tests pin the
 * requests behind it: one list request on mount, a list re-fetch after each
 * write (the mutation's `invalidates`), and the query's error state.
 */

import { test, expect, type Page } from '@playwright/test'

const baseUrl = 'http://localhost:3002'

/** Count the GET /api/todos requests the page sends from now on. */
function countListRequests(page: Page): () => number {
  let count = 0
  page.on('request', req => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === '/api/todos') count++
  })
  return () => count
}

test.describe.serial('QueryTodoApp (createQuery / createMutation)', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post(`${baseUrl}/api/todos/reset`)
  })

  test('requests the list once on mount', async ({ page }) => {
    const listRequests = countListRequests(page)
    await page.goto(`${baseUrl}/todos`)
    await expect(page.locator('.todo-list li')).toHaveCount(3)
    await expect(page.locator('.todoapp')).toHaveAttribute('aria-busy', 'false')
    expect(listRequests()).toBe(1)
  })

  test('a write re-fetches the list instead of patching it', async ({ page }) => {
    await page.goto(`${baseUrl}/todos`)
    await expect(page.locator('.todo-list li')).toHaveCount(3)
    const listRequests = countListRequests(page)

    const toggle = page.locator('.todo-list li').first().locator('input.toggle')
    const [put] = await Promise.all([
      page.waitForRequest(req => req.method() === 'PUT' && req.url().endsWith('/api/todos/1')),
      toggle.click({ force: true }),
    ])
    expect(put.postDataJSON()).toEqual({ done: true })

    await expect(page.locator('.todo-list li').first()).toHaveClass(/completed/)
    expect(listRequests()).toBe(1)
  })

  test('toggle all marks every todo done in one request, then back', async ({ page }) => {
    await page.goto(`${baseUrl}/todos`)
    await expect(page.locator('.todo-list li')).toHaveCount(3)

    await page.locator('label[for="toggle-all"]').click()
    await expect(page.locator('.todo-list li.completed')).toHaveCount(3)
    await expect(page.locator('.todo-count')).toContainText('0 items left')
    await expect(page.locator('#toggle-all')).toBeChecked()

    await page.locator('label[for="toggle-all"]').click()
    await expect(page.locator('.todo-list li.completed')).toHaveCount(0)
    await expect(page.locator('.todo-count')).toContainText('3 items left')
  })

  test('a failed list request shows the error, and a retry clears it', async ({ page }) => {
    let fail = true
    await page.route('**/api/todos', route =>
      fail ? route.fulfill({ status: 500, body: '{}' }) : route.continue(),
    )
    await page.goto(`${baseUrl}/todos`)
    await expect(page.getByRole('alert')).toHaveText('Could not load todos.')
    await expect(page.locator('.todo-list li')).toHaveCount(0)

    // A write invalidates the list, and the next list request succeeds.
    fail = false
    await page.fill('input.new-todo', 'After the outage')
    await page.press('input.new-todo', 'Enter')
    await expect(page.locator('.todo-list li')).toHaveCount(4)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('a failed add keeps the typed text and reports no unhandled rejection', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))
    await page.route('**/api/todos', route =>
      route.request().method() === 'POST' ? route.fulfill({ status: 500, body: '{}' }) : route.continue(),
    )
    await page.goto(`${baseUrl}/todos`)
    await expect(page.locator('.todo-list li')).toHaveCount(3)

    await page.fill('input.new-todo', 'Will not be saved')
    await page.press('input.new-todo', 'Enter')
    await expect(page.getByRole('alert')).toHaveText('Could not add the todo.')
    await expect(page.locator('input.new-todo')).toHaveValue('Will not be saved')
    await expect(page.locator('.todo-list li')).toHaveCount(3)
    expect(pageErrors).toEqual([])
  })
})
