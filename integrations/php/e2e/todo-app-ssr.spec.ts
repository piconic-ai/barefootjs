/**
 * TodoAppSSR E2E tests for PHP example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3012/integrations/php', '/todos-ssr')
