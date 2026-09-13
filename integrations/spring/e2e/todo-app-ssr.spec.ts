/**
 * TodoAppSSR E2E tests for the Spring example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3017/integrations/spring', '/todos-ssr')
