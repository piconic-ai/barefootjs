/**
 * TodoAppSSR E2E tests for Rails example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3009/integrations/rails', '/todos-ssr')
