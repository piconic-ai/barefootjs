/**
 * TodoAppSSR E2E tests for Echo example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:8080/integrations/echo', '/todos-ssr')
