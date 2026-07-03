/**
 * TodoAppSSR E2E tests for Sinatra example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3010/integrations/sinatra', '/todos-ssr')
