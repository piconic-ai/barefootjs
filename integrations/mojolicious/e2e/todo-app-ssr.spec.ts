/**
 * TodoAppSSR E2E tests for Mojolicious example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3004/integrations/mojolicious', '/todos-ssr')
