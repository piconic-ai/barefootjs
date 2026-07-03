/**
 * TodoAppSSR E2E tests for Flask example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3008/integrations/flask', '/todos-ssr')
