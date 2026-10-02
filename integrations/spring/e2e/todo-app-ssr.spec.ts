/**
 * TodoAppSSR E2E tests for the Spring example
 *
 * Tests TodoApp without @client markers
 */

import { test, expect } from '@playwright/test'
import { todoAppTests } from '../../shared/e2e/todo-app.spec'

const BASE_URL = 'http://localhost:3017/integrations/spring'

todoAppTests(BASE_URL, '/todos-ssr')

// #3250: `filter` is a Pebble reserved word, so the compiled template reads
// it as `filter_`. The root context used to key it as `filter`, so the
// server HTML's "All" link had no `selected` class until hydration fixed it
// up. Check the server's own HTML, before any client JS runs.
test.describe('TodoAppSSR server HTML (Spring)', () => {
  for (const path of ['/todos-ssr', '/todos', '/todos-query']) {
    test(`${path}: the "All" filter link is selected in the server HTML`, async ({ request }) => {
      await request.post(`${BASE_URL}/api/todos/reset`)
      const html = await (await request.get(`${BASE_URL}${path}`)).text()
      const allLink = html.match(/<a\b[^>]*>All<\/a>/)?.[0]
      expect(allLink).toBeDefined()
      expect(allLink).toMatch(/class="selected"/)
    })
  }
})
