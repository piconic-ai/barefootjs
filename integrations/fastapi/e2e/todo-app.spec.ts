/**
 * TodoApp E2E tests for FastAPI example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3009/integrations/fastapi')
