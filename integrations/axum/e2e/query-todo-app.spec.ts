/**
 * QueryTodoApp mode-A E2E tests for the Axum example (`/todos-query`).
 */

import { queryTodoAppTests } from '../../shared/e2e/query-todo-app.spec'

queryTodoAppTests('http://localhost:3012/integrations/axum')
