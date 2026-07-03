/**
 * TodoAppSSR E2E tests for FastAPI example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3009/integrations/fastapi', '/todos-ssr')
