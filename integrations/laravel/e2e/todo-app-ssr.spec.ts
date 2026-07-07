/**
 * TodoAppSSR E2E tests for Laravel example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3016/integrations/laravel', '/todos-ssr')
