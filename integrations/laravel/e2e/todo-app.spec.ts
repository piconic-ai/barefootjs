/**
 * TodoApp E2E tests for Laravel example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3016/integrations/laravel')
