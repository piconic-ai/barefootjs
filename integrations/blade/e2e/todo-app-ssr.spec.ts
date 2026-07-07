/**
 * TodoAppSSR E2E tests for Blade example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3015/integrations/blade', '/todos-ssr')
