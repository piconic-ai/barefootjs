/**
 * TodoAppSSR E2E tests for h3 example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3003/integrations/h3', '/todos-ssr')
