/**
 * TodoAppSSR E2E tests for Elysia example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3005', '/todos-ssr')
