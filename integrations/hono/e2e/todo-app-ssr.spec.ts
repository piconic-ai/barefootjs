/**
 * TodoAppSSR E2E tests for Hono example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3001/integrations/hono', '/todos-ssr')
