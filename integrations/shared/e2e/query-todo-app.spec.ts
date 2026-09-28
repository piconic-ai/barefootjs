/**
 * QueryTodoApp E2E tests for a server-rendered page (mode A): what server
 * rendering adds to the createQuery / createMutation todo app. The page
 * passes `initialTodos`, which seeds the query (spec/async.md §7.6): the
 * server renders the list, and the client sends no list request on mount.
 * The shared TodoMVC suite (`todo-app.spec.ts`, run against the same path)
 * covers the visible behaviour.
 */

import { test, expect, type Page } from '@playwright/test'

/**
 * @param baseUrl - The integration's base URL, e.g. 'http://localhost:3001/integrations/hono'
 */
export function queryTodoAppTests(baseUrl: string) {
  const pageUrl = `${baseUrl}/todos-query`
  const listPath = `${new URL(baseUrl).pathname.replace(/\/$/, '')}/api/todos`

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

  // Outside the describe below: it opens its own JavaScript-free context,
  // so the describe's per-test reset of `page` would be wasted on it.
  test('QueryTodoApp (mode A): the server renders the list from initialTodos', async ({ browser }) => {
    test.setTimeout(30000)
    // No JavaScript: what shows is the server's HTML alone.
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.request.post(`${baseUrl}/api/todos/reset`)
    await page.goto(pageUrl)
    await expect(page.locator('.todo-list li')).toHaveCount(3)
    await expect(page.locator('.todo-list li').nth(2)).toHaveClass(/completed/)
    await expect(page.locator('.todo-count')).toContainText('2 items left')
    await expect(page.locator('.clear-completed')).toBeVisible()
    await context.close()
  })

  test.describe.serial('QueryTodoApp (mode A)', () => {
    test.setTimeout(30000)

    test.beforeEach(async ({ page }) => {
      await page.request.post(`${baseUrl}/api/todos/reset`)
    })

    test('hydration sends no list request', async ({ page }) => {
      const listRequests = countListRequests(page)
      await page.goto(pageUrl)
      await waitForHydration(page)
      await expect(page.locator('.todo-list li')).toHaveCount(3)
      await expect(page.locator('.todoapp')).toHaveAttribute('aria-busy', 'false')
      expect(listRequests()).toBe(0)
    })

    test('a write re-fetches the list under the base path', async ({ page }) => {
      await page.goto(pageUrl)
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
      await page.goto(pageUrl)
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
}
