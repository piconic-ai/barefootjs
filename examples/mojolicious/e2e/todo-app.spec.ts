/**
 * TodoApp E2E tests for Mojolicious example
 *
 * Uses shared test suite from examples/shared/e2e
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3004')
