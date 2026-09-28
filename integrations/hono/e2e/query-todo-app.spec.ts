/**
 * QueryTodoApp E2E tests on Hono: what server rendering adds to the
 * createQuery / createMutation todo app. The page passes `initialTodos`,
 * which seeds the query (mode A, spec/async.md §7.6): the server renders
 * the list, and the client sends no list request on mount. The shared
 * TodoMVC suite (todo-app-query.spec.ts) covers the visible behaviour.
 */

import { test, expect, type Page } from '@playwright/test'

const baseUrl = 'http://localhost:3001/integrations/hono'
const listPath = '/integrations/hono/api/todos'

/** Count the list requests (GET api/todos) the page sends from now on. */
function countListRequests(page: Page): () => number {
  let count = 0
  page.on('request', req => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === listPath) count++
  })
  return () => count
}

/** Wait until the rows are hydrated (their scope is the row component's). */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForSelector('.todo-list li[bf-s*="QueryTodoItem_"]', { timeout: 10000 })
}

test.describe.serial('QueryTodoApp on Hono (mode A)', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post(`${baseUrl}/api/todos/reset`)
  })

  test('the server renders the list from initialTodos', async ({ browser }) => {
    // No JavaScript: what shows is the server's HTML alone.
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.request.post(`${baseUrl}/api/todos/reset`)
    await page.goto(`${baseUrl}/todos-query`)
    await expect(page.locator('.todo-list li')).toHaveCount(3)
    await expect(page.locator('.todo-list li').nth(2)).toHaveClass(/completed/)
    await expect(page.locator('.todo-count')).toContainText('2 items left')
    await expect(page.locator('.clear-completed')).toBeVisible()
    await context.close()
  })

  test('hydration sends no list request', async ({ page }) => {
    const listRequests = countListRequests(page)
    await page.goto(`${baseUrl}/todos-query`)
    await waitForHydration(page)
    await expect(page.locator('.todo-list li')).toHaveCount(3)
    await expect(page.locator('.todoapp')).toHaveAttribute('aria-busy', 'false')
    expect(listRequests()).toBe(0)
  })

  test('a write re-fetches the list under the base path', async ({ page }) => {
    await page.goto(`${baseUrl}/todos-query`)
    await waitForHydration(page)
    const listRequests = countListRequests(page)

    const toggle = page.locator('.todo-list li').first().locator('input.toggle')
    const [put] = await Promise.all([
      page.waitForRequest(req => req.method() === 'PUT' && new URL(req.url()).pathname === `${listPath}/1`),
      toggle.click({ force: true }),
    ])
    expect(put.postDataJSON()).toEqual({ done: true })

    await expect(page.locator('.todo-list li').first()).toHaveClass(/completed/)
    await expect.poll(listRequests).toBe(1)
  })

  test('toggle all and clear completed each take one request', async ({ page }) => {
    await page.goto(`${baseUrl}/todos-query`)
    await waitForHydration(page)
    // Every write the page sends, as "METHOD pathname".
    const writes: string[] = []
    page.on('request', req => {
      if (req.method() !== 'GET') writes.push(`${req.method()} ${new URL(req.url()).pathname}`)
    })

    await page.locator('label[for="toggle-all"]').click()
    await expect(page.locator('.todo-list li.completed')).toHaveCount(3)
    await expect(page.locator('.todo-count')).toContainText('0 items left')
    expect(writes).toEqual([`PUT ${listPath}`])

    await page.click('.clear-completed')
    await expect(page.locator('.todo-list li')).toHaveCount(0)
    expect(writes).toEqual([`PUT ${listPath}`, `DELETE ${listPath}/completed`])
  })
})
