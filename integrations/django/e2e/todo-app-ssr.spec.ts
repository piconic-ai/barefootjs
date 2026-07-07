/**
 * TodoAppSSR E2E tests for Django example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3014/integrations/django', '/todos-ssr')
